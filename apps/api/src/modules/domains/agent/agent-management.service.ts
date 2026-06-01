import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  agentKnowledgeBases,
  agents,
  conversations,
  db,
} from "@knowflow/db";
import type {
  CreateManagedAgentRequest,
  ManagedAgent,
  ManagedAgentListResponse,
  UpdateManagedAgentRequest,
} from "@knowflow/shared";
import { and, asc, count, desc, eq } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";

type AgentRow = typeof agents.$inferSelect;

@Injectable()
export class AgentManagementService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
  ) {}

  async listByKnowledgeBase(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ): Promise<ManagedAgentListResponse> {
    await this.ensureCanManageKnowledgeBase(knowledgeBaseId, user);

    const rows = await db
      .select({ agent: agents })
      .from(agentKnowledgeBases)
      .innerJoin(agents, eq(agents.id, agentKnowledgeBases.agentId))
      .where(
        and(
          eq(agentKnowledgeBases.knowledgeBaseId, knowledgeBaseId),
          eq(agents.type, "official"),
        ),
      )
      .orderBy(desc(agents.isDefault), desc(agents.updatedAt), asc(agents.name));

    return {
      items: await Promise.all(rows.map((row) => this.toManagedAgent(row.agent))),
    };
  }

  async create(
    knowledgeBaseId: string,
    input: CreateManagedAgentRequest,
    user: AuthenticatedUser,
  ): Promise<ManagedAgent> {
    await this.ensureCanManageKnowledgeBase(knowledgeBaseId, user);

    const [created] = await db.transaction(async (tx) => {
      const [agent] = await tx
        .insert(agents)
        .values({
          name: input.name,
          description: input.description ?? null,
          type: "official",
          ownerId: null,
          systemPrompt: this.ensureCitationPrompt(
            input.systemPrompt ?? this.defaultSystemPrompt(input.name),
          ),
          openingMessage: input.openingMessage ?? null,
          recommendedQuestions: input.recommendedQuestions ?? [],
          answerStyle: input.answerStyle ?? null,
          allowAttachments: input.allowAttachments ?? true,
          forceCitation: true,
          visibility: "knowledge_base_members",
          status: "draft",
          isDefault: false,
          modelProvider: input.modelProvider ?? null,
          modelName: input.modelName ?? null,
          modelConfig: input.modelConfig ?? {},
          createdBy: user.id,
        })
        .returning();
      if (agent === undefined) {
        throw new BadRequestException("Failed to create agent");
      }

      await tx.insert(agentKnowledgeBases).values({
        agentId: agent.id,
        knowledgeBaseId,
      });

      return [agent];
    });

    return this.toManagedAgent(created);
  }

  async update(
    agentId: string,
    input: UpdateManagedAgentRequest,
    user: AuthenticatedUser,
  ): Promise<ManagedAgent> {
    const agent = await this.findOfficialAgent(agentId);
    await this.ensureCanManageAgent(agent.id, user);

    const values: Partial<typeof agents.$inferInsert> = {};
    if (input.name !== undefined) {
      values.name = input.name;
    }
    if (input.description !== undefined) {
      values.description = input.description;
    }
    if (input.systemPrompt !== undefined) {
      values.systemPrompt = this.ensureCitationPrompt(input.systemPrompt);
    }
    if (input.openingMessage !== undefined) {
      values.openingMessage = input.openingMessage;
    }
    if (input.recommendedQuestions !== undefined) {
      values.recommendedQuestions = input.recommendedQuestions;
    }
    if (input.answerStyle !== undefined) {
      values.answerStyle = input.answerStyle;
    }
    if (input.allowAttachments !== undefined) {
      values.allowAttachments = input.allowAttachments;
    }
    if (input.visibility !== undefined) {
      values.visibility = input.visibility;
    }
    if (input.modelProvider !== undefined) {
      values.modelProvider = input.modelProvider;
    }
    if (input.modelName !== undefined) {
      values.modelName = input.modelName;
    }
    if (input.modelConfig !== undefined) {
      values.modelConfig = input.modelConfig;
    }

    const [updated] = await db
      .update(agents)
      .set({ ...values, forceCitation: true, updatedAt: new Date() })
      .where(eq(agents.id, agent.id))
      .returning();
    if (updated === undefined) {
      throw new BadRequestException("Failed to update agent");
    }

    return this.toManagedAgent(updated);
  }

  async publish(agentId: string, user: AuthenticatedUser): Promise<ManagedAgent> {
    const agent = await this.findOfficialAgent(agentId);
    await this.ensureCanManageAgent(agent.id, user);

    const [updated] = await db
      .update(agents)
      .set({
        status: "published",
        forceCitation: true,
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .returning();
    if (updated === undefined) {
      throw new BadRequestException("Failed to publish agent");
    }

    return this.toManagedAgent(updated);
  }

  async disable(agentId: string, user: AuthenticatedUser): Promise<ManagedAgent> {
    const agent = await this.findOfficialAgent(agentId);
    await this.ensureCanManageAgent(agent.id, user);

    const [updated] = await db
      .update(agents)
      .set({
        status: "disabled",
        updatedAt: new Date(),
      })
      .where(eq(agents.id, agent.id))
      .returning();
    if (updated === undefined) {
      throw new BadRequestException("Failed to disable agent");
    }

    return this.toManagedAgent(updated);
  }

  async delete(agentId: string, user: AuthenticatedUser): Promise<void> {
    const agent = await this.findOfficialAgent(agentId);
    await this.ensureCanManageAgent(agent.id, user);
    if (agent.isDefault) {
      throw new BadRequestException("Cannot delete the default agent");
    }

    const [{ value: conversationCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(conversations)
      .where(eq(conversations.agentId, agent.id));
    if (conversationCount > 0) {
      throw new BadRequestException("Cannot delete an agent that has conversations");
    }

    await db.transaction(async (tx) => {
      await tx
        .delete(agentKnowledgeBases)
        .where(eq(agentKnowledgeBases.agentId, agent.id));
      await tx.delete(agents).where(eq(agents.id, agent.id));
    });
  }

  private async findOfficialAgent(agentId: string): Promise<AgentRow> {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.id, agentId), eq(agents.type, "official")))
      .limit(1);
    if (agent === undefined) {
      throw new NotFoundException("Agent not found");
    }
    return agent;
  }

  private async ensureCanManageKnowledgeBase(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }

    throw new ForbiddenException("Cannot manage agents for this knowledge base");
  }

  private async ensureCanManageAgent(
    agentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const bindings = await this.findAgentKnowledgeBaseIds(agentId);
    if (bindings.length === 0) {
      throw new NotFoundException("Agent knowledge base binding not found");
    }

    for (const knowledgeBaseId of bindings) {
      await this.ensureCanManageKnowledgeBase(knowledgeBaseId, user);
    }
  }

  private async findAgentKnowledgeBaseIds(agentId: string): Promise<string[]> {
    const rows = await db
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .where(eq(agentKnowledgeBases.agentId, agentId))
      .orderBy(asc(agentKnowledgeBases.createdAt));

    return rows.map((row) => row.knowledgeBaseId);
  }

  private async toManagedAgent(agent: AgentRow): Promise<ManagedAgent> {
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      type: agent.type,
      visibility: agent.visibility,
      status: agent.status,
      isDefault: agent.isDefault,
      openingMessage: agent.openingMessage,
      recommendedQuestions: this.normalizeRecommendedQuestions(agent.recommendedQuestions),
      knowledgeBaseIds: await this.findAgentKnowledgeBaseIds(agent.id),
      systemPrompt: agent.systemPrompt,
      answerStyle: agent.answerStyle,
      allowAttachments: agent.allowAttachments,
      forceCitation: agent.forceCitation,
      modelProvider: agent.modelProvider,
      modelName: agent.modelName,
      modelConfig:
        agent.modelConfig !== null && typeof agent.modelConfig === "object"
          ? (agent.modelConfig as Record<string, unknown>)
          : {},
      createdBy: agent.createdBy,
      publishedAt: agent.publishedAt?.toISOString() ?? null,
      createdAt: agent.createdAt.toISOString(),
      updatedAt: agent.updatedAt.toISOString(),
    };
  }

  private normalizeRecommendedQuestions(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  protected defaultSystemPrompt(agentName: string): string {
    return this.ensureCitationPrompt(
      `你是${agentName}，必须基于授权知识库内容回答用户问题。`,
    );
  }

  protected ensureCitationPrompt(prompt: string): string {
    const constraints =
      "回答必须基于授权知识库内容；使用依据时必须展示引用来源；没有可靠依据时必须明确说明未找到依据，不得编造。";
    return prompt.includes("引用") && (prompt.includes("不编造") || prompt.includes("不得编造"))
      ? prompt
      : `${prompt.trim()}\n\n${constraints}`;
  }
}
