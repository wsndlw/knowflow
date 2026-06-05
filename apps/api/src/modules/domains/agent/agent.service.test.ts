import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NotFoundException } from "@nestjs/common";
import { agentKnowledgeBases, agents, conversations, db, knowledgeBases } from "@knowflow/db";
import type { ConversationListQuery } from "@knowflow/shared";
import { and, eq, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AgentService } from "./agent.service.js";
import type { AgentState } from "./agent.types.js";

type AgentServiceInternals = {
  buildAgentAccessCondition: (user: AuthenticatedUser) => SQL | undefined;
  buildAgentBoundToKnowledgeBaseExists: (
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ) => SQL;
  buildAgentKnowledgeBaseScopeCondition: (
    agentId: string,
    user: AuthenticatedUser,
  ) => SQL | undefined;
  findConversationForUser: (
    conversationId: string,
    user: AuthenticatedUser,
  ) => Promise<ConversationRow>;
};

type ConversationRow = typeof conversations.$inferSelect;

type SelectChain = {
  from: (table: unknown) => SelectChain;
  where: (condition: unknown) => SelectChain;
  orderBy: (...conditions: unknown[]) => Promise<unknown[]>;
  limit: (limit: number) => Promise<unknown[]>;
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => {
      returning: () => Promise<unknown[]>;
    };
  };
};

type MutableDb = {
  select: (selection?: unknown) => SelectChain;
  update: (table: unknown) => UpdateChain;
};

type UpdateRecord = {
  table: unknown;
  values: Record<string, unknown>;
  condition?: unknown;
};

type AgentServiceGenerationInternals = {
  generateAnswerStream: (state: AgentState) => Promise<AgentState>;
};

type AgentServiceQueueInternals = {
  logger: { warn: (message: string) => void };
  enqueueConversationSummaryIfNeeded: (conversationId: string) => Promise<void>;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LlmStub = {
  streamedMessages: ChatMessage[];
  streamChat: (input: { messages: ChatMessage[] }) => AsyncIterable<{ delta: string }>;
};

const user: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000002",
};

const superAdmin: AuthenticatedUser = {
  ...user,
  id: "00000000-0000-0000-0000-000000000099",
  platformRole: "super_admin",
};

const conversationId = "00000000-0000-0000-0000-000000000200";
const agentId = "00000000-0000-0000-0000-000000000300";

function serviceWithAccessCondition(): AgentServiceInternals {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {
      buildAccessCondition: () => eq(knowledgeBases.visibility, "public"),
      canAccess: () => Promise.reject(new Error("canAccess should not be used by SQL helpers")),
    } as unknown as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceInternals;
}

function serviceWithoutAccessCondition(): AgentServiceInternals {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {
      buildAccessCondition: () => undefined,
      canAccess: () => Promise.reject(new Error("canAccess should not be used by SQL helpers")),
    } as unknown as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceInternals;
}

void describe("AgentService conversation archive semantics", () => {
  void it("archives a conversation by flipping status to archived", async () => {
    const service = makeService();
    Object.assign(service as object, {
      findConversationForUser: () => Promise.resolve(makeConversationRow()),
    } satisfies Pick<AgentServiceInternals, "findConversationForUser">);

    const { updates, restore } = captureConversationUpdates([
      makeConversationRow({ status: "archived" }),
    ]);
    try {
      const result = await service.archiveConversation(conversationId, user);
      const update = updates.find((item) => item.table === conversations);

      assert.ok(update);
      assert.equal(update.values["status"], "archived");
      assert.equal(Object.prototype.toString.call(update.values["updatedAt"]), "[object Date]");
      assert.equal(result.status, "archived");
    } finally {
      restore();
    }
  });

  void it("restores a conversation by flipping status to active", async () => {
    const service = makeService();
    Object.assign(service as object, {
      findConversationForUser: () =>
        Promise.resolve(makeConversationRow({ status: "archived" })),
    } satisfies Pick<AgentServiceInternals, "findConversationForUser">);

    const { updates, restore } = captureConversationUpdates([makeConversationRow()]);
    try {
      const result = await service.restoreConversation(conversationId, user);
      const update = updates.find((item) => item.table === conversations);

      assert.ok(update);
      assert.equal(update.values["status"], "active");
      assert.equal(Object.prototype.toString.call(update.values["updatedAt"]), "[object Date]");
      assert.equal(result.status, "active");
    } finally {
      restore();
    }
  });

  void it("returns 404 before updating when the user does not own the conversation", async () => {
    const service = makeService();
    const { restore } = captureConversationSelect([]);
    try {
      await assert.rejects(() => service.archiveConversation(conversationId, user), NotFoundException);
    } finally {
      restore();
    }
  });

  void it("returns 404 before restoring when the user does not own the conversation", async () => {
    const service = makeService();
    const { restore } = captureConversationSelect([]);
    try {
      await assert.rejects(() => service.restoreConversation(conversationId, user), NotFoundException);
    } finally {
      restore();
    }
  });

  void it("filters conversation lists to active conversations by default", async () => {
    const { params } = await buildListSql({});

    assert.equal(params.includes(user.id), true);
    assert.equal(params.includes("active"), true);
  });

  void it("supports listing archived conversations explicitly", async () => {
    const { params } = await buildListSql({ status: "archived" });

    assert.equal(params.includes(user.id), true);
    assert.equal(params.includes("archived"), true);
  });
});

void describe("AgentService SQL access filters", () => {
  void it("pushes agent visibility and knowledge-base-member access into one EXISTS condition", () => {
    const service = serviceWithAccessCondition();
    const condition = service.buildAgentAccessCondition(user);
    const { sql, params } = db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.status, "published"), condition))
      .toSQL();

    assert.match(sql, /exists \(select/);
    assert.match(sql, /"agent_knowledge_bases"/);
    assert.match(sql, /inner join "knowledge_bases"/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.match(sql, /"knowledge_bases"\."visibility" =/);
    assert.equal(params.includes("active"), true);
    assert.equal(params.includes("knowledge_base_members"), true);
    assert.equal(params.includes("private"), true);
    assert.equal(params.includes("selected_members"), true);
    assert.equal(params.includes(user.id), true);
  });

  void it("keeps archived agent-bound knowledge bases out of runtime scope", () => {
    const service = serviceWithAccessCondition();
    const condition = service.buildAgentKnowledgeBaseScopeCondition("agent-1", user);
    const { sql, params } = db
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, agentKnowledgeBases.knowledgeBaseId))
      .where(condition)
      .toSQL();

    assert.match(sql, /"agent_knowledge_bases"\."agent_id" =/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.match(sql, /"knowledge_bases"\."visibility" =/);
    assert.equal(params.includes("agent-1"), true);
    assert.equal(params.includes("active"), true);
  });

  void it("still filters inactive agent-bound knowledge bases for super admins", () => {
    const service = serviceWithoutAccessCondition();
    const condition = service.buildAgentKnowledgeBaseScopeCondition("agent-1", superAdmin);
    const { sql, params } = db
      .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
      .from(agentKnowledgeBases)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, agentKnowledgeBases.knowledgeBaseId))
      .where(condition)
      .toSQL();

    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.doesNotMatch(sql, /"knowledge_bases"\."visibility" =/);
    assert.deepEqual(params, ["agent-1", "active"]);
  });

  void it("scopes the usable-agent list to a knowledge base the user can access", () => {
    const service = serviceWithAccessCondition();
    const condition = service.buildAgentBoundToKnowledgeBaseExists(
      "00000000-0000-0000-0000-0000000004cb",
      user,
    );
    const { sql, params } = db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.status, "published"), condition))
      .toSQL();

    assert.match(sql, /exists \(select/);
    assert.match(sql, /"agent_knowledge_bases"\."agent_id" =/);
    assert.match(sql, /"agent_knowledge_bases"\."knowledge_base_id" =/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    // 普通用户：可见性条件随 buildAccessCondition 一并下推
    assert.match(sql, /"knowledge_bases"\."visibility" =/);
    assert.equal(params.includes("active"), true);
    assert.equal(params.includes("published"), true);
  });

  void it("drops the visibility filter for super admins but keeps the knowledge-base binding", () => {
    const service = serviceWithoutAccessCondition();
    const condition = service.buildAgentBoundToKnowledgeBaseExists(
      "00000000-0000-0000-0000-0000000004cb",
      superAdmin,
    );
    const { sql } = db
      .select({ id: agents.id })
      .from(agents)
      .where(and(eq(agents.status, "published"), condition))
      .toSQL();

    assert.match(sql, /"agent_knowledge_bases"\."knowledge_base_id" =/);
    assert.match(sql, /"knowledge_bases"\."status" =/);
    assert.doesNotMatch(sql, /"knowledge_bases"\."visibility" =/);
  });
});

async function buildListSql(query: ConversationListQuery) {
  const condition = await captureConversationListCondition(query);
  return db
    .select({ id: conversations.id })
    .from(conversations)
    .where(condition as SQL)
    .toSQL();
}

async function captureConversationListCondition(query: ConversationListQuery): Promise<unknown> {
  const service = makeService();
  let capturedCondition: unknown;
  const { restore } = captureConversationSelect([], (condition) => {
    capturedCondition = condition;
  });
  try {
    await service.listConversations(user, query);
  } finally {
    restore();
  }
  return capturedCondition;
}

function captureConversationSelect(
  rows: ConversationRow[],
  onWhere: (condition: unknown) => void = () => undefined,
) {
  const mutableDb = db as unknown as MutableDb;
  const originalSelect = mutableDb.select;
  const chain: SelectChain = {
    from() {
      return chain;
    },
    where(condition: unknown) {
      onWhere(condition);
      return chain;
    },
    orderBy() {
      return Promise.resolve(rows);
    },
    limit() {
      return Promise.resolve(rows);
    },
  };

  mutableDb.select = () => chain;

  return {
    restore: () => {
      mutableDb.select = originalSelect;
    },
  };
}

function captureConversationUpdates(rows: ConversationRow[]) {
  const mutableDb = db as unknown as MutableDb;
  const originalUpdate = mutableDb.update;
  const updates: UpdateRecord[] = [];

  mutableDb.update = (table: unknown) => ({
    set(values: Record<string, unknown>) {
      const update: UpdateRecord = { table, values };
      updates.push(update);
      return {
        where(condition: unknown) {
          update.condition = condition;
          return {
            returning() {
              return Promise.resolve(rows);
            },
          };
        },
      };
    },
  });

  return {
    updates,
    restore: () => {
      mutableDb.update = originalUpdate;
    },
  };
}

function makeService(): AgentService {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {
      buildAccessCondition: () => undefined,
      canAccess: () => Promise.resolve(true),
    } as unknown as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  );
}

function makeConversationRow(overrides: Partial<ConversationRow> = {}): ConversationRow {
  return {
    id: conversationId,
    userId: user.id,
    agentId,
    title: "Quarterly planning",
    status: "active",
    pinned: false,
    favorited: false,
    lastMessageAt: new Date("2026-06-05T02:00:00.000Z"),
    createdAt: new Date("2026-06-05T01:00:00.000Z"),
    updatedAt: new Date("2026-06-05T02:00:00.000Z"),
    rollingSummary: null,
    summarizedMessageCount: 0,
    ...overrides,
  };
}

void describe("AgentService conversation memory answer generation", () => {
  void it("uses short-term memory even when retrieval returns no contexts", async () => {
    const llm = makeLlmStub("memory answer");
    const service = serviceWithGeneration(llm);
    const state = makeGenerationState({
      retrievalContexts: [],
      recentMessages: [{ role: "user", content: "previous topic" }],
    });

    const result = await service.generateAnswerStream(state);

    assert.equal(result.answer, "memory answer");
    assert.equal(result.noAnswerType, null);
    assert.deepEqual(llm.streamedMessages.map((message) => message.role), [
      "system",
      "system",
      "user",
      "user",
    ]);
    assert.equal(
      llm.streamedMessages.some((message) => message.content.includes("previous topic")),
      true,
    );
  });

  void it("uses memory instead of low-score fallback when weak retrieval exists", async () => {
    const llm = makeLlmStub("low score memory answer");
    const service = serviceWithGeneration(llm);
    const state = makeGenerationState({
      retrievalContexts: [makeRetrievalContext({ rerankScore: 0.01 })],
      conversationSummary: "The user asked about onboarding.",
    });

    const result = await service.generateAnswerStream(state);

    assert.equal(result.answer, "low score memory answer");
    assert.equal(result.noAnswerType, null);
    assert.equal(
      llm.streamedMessages.some((message) => message.content.includes("onboarding")),
      true,
    );
  });

  void it("keeps fallback when there is neither retrieval context nor conversation memory", async () => {
    const llm = makeLlmStub("should not stream");
    const service = serviceWithGeneration(llm);
    const state = makeGenerationState({ retrievalContexts: [] });

    const result = await service.generateAnswerStream(state);

    assert.equal(result.noAnswerType, "no_answer");
    assert.equal(llm.streamedMessages.length, 0);
  });
});

void describe("AgentService conversation summary enqueue", () => {
  void it("swallows enqueue failures and logs a warning", async () => {
    const mutableDb = db as unknown as MutableDb;
    const originalSelect = mutableDb.select;
    const warnings: string[] = [];
    const service = serviceWithQueue();
    service.logger = {
      warn(message: string) {
        warnings.push(message);
      },
    };
    mutableDb.select = () => {
      throw new Error("database unavailable");
    };

    try {
      await service.enqueueConversationSummaryIfNeeded(
        "00000000-0000-0000-0000-000000000010",
      );

      assert.equal(warnings.length, 1);
      assert.match(warnings[0] ?? "", /Failed to enqueue conversation summary/);
    } finally {
      mutableDb.select = originalSelect;
    }
  });
});

function serviceWithGeneration(llm: LlmStub): AgentServiceGenerationInternals {
  return new AgentService(
    llm as unknown as ConstructorParameters<typeof AgentService>[0],
    {} as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceGenerationInternals;
}

function serviceWithQueue(): AgentServiceQueueInternals {
  return new AgentService(
    {} as ConstructorParameters<typeof AgentService>[0],
    {} as ConstructorParameters<typeof AgentService>[1],
    {} as ConstructorParameters<typeof AgentService>[2],
    {} as ConstructorParameters<typeof AgentService>[3],
  ) as unknown as AgentServiceQueueInternals;
}

function makeLlmStub(answer: string): LlmStub {
  return {
    streamedMessages: [],
    async *streamChat(input: { messages: ChatMessage[] }) {
      this.streamedMessages = input.messages;
      await Promise.resolve();
      yield { delta: answer };
    },
  };
}

function makeGenerationState(
  options: {
    retrievalContexts?: NonNullable<AgentState["retrieval"]>["contexts"];
    recentMessages?: AgentState["recentMessages"];
    conversationSummary?: string | null;
  } = {},
): AgentState {
  const retrievalContexts = options.retrievalContexts ?? [];
  return {
    user,
    conversation: {
      id: "00000000-0000-0000-0000-000000000010",
      agentId: "00000000-0000-0000-0000-000000000020",
      title: "Conversation",
      status: "active",
      pinned: false,
      favorited: false,
      lastMessageAt: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    userMessageId: "00000000-0000-0000-0000-000000000030",
    query: "What did I ask before?",
    agent: {
      id: "00000000-0000-0000-0000-000000000020",
      name: "Agent",
      description: null,
      type: "global",
      visibility: "global",
      status: "published",
      isDefault: true,
      openingMessage: null,
      recommendedQuestions: [],
      systemPrompt: null,
    },
    knowledgeScope: [],
    accessibleKnowledgeBases: [],
    recentMessages: options.recentMessages ?? [],
    conversationSummary: options.conversationSummary ?? null,
    rewrittenQueries: ["What did I ask before?"],
    retrieval: {
      query: "What did I ask before?",
      rewrittenQueries: ["What did I ask before?"],
      candidates: [],
      contexts: retrievalContexts,
      trace: {
        allowedKnowledgeBaseIds: [],
        recalled: { vector: 0, fts: 0, knowledgeItem: 0 },
        merged: 0,
        reranked: 0,
        final: retrievalContexts.length,
      },
    },
    promptSnapshot: "system prompt",
    answer: "",
    citations: [],
    confidenceLevel: null,
    noAnswerType: null,
    assistantMessage: null,
    steps: [],
    startedAt: Date.now(),
    error: null,
    emit: () => Promise.resolve(),
  };
}

function makeRetrievalContext(
  overrides: Partial<NonNullable<AgentState["retrieval"]>["contexts"][number]> = {},
): NonNullable<AgentState["retrieval"]>["contexts"][number] {
  return {
    id: "context-1",
    sourceType: "knowledge_document",
    knowledgeBaseId: "00000000-0000-0000-0000-000000000040",
    knowledgeBaseName: "Knowledge base",
    documentId: "00000000-0000-0000-0000-000000000050",
    knowledgeItemId: null,
    childChunkId: "00000000-0000-0000-0000-000000000060",
    parentChunkId: null,
    title: "Context",
    content: "Context",
    parentContent: null,
    snippet: "Context",
    pageOrSection: null,
    channels: ["fts"],
    initialScore: 0.01,
    rerankScore: null,
    knowledgeItemVerified: false,
    sourceExpired: false,
    tokenCount: 10,
    contextText: "Context",
    citationIndex: 1,
    ...overrides,
  };
}
