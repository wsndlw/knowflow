import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  db,
  departments,
  documents,
  knowledgeBaseAdmins,
  knowledgeBaseMembers,
  knowledgeBases,
  metadataFields,
  tags,
  users,
} from "@knowflow/db";
import type {
  CreateKnowledgeBaseRequest,
  KnowledgeBase,
  KnowledgeBaseListQuery,
  KnowledgeBaseListResponse,
  UpdateKnowledgeBaseRequest,
} from "@knowflow/shared";
import { and, asc, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";

const creator = alias(users, "creator");

type KnowledgeBaseRow = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  departmentName: string;
  visibility: KnowledgeBase["visibility"];
  status: KnowledgeBase["status"];
  indexStatus: KnowledgeBase["indexStatus"];
  creatorId: string;
  creatorName: string;
  embeddingModel: string;
  embeddingDimension: number;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly accessService: KnowledgeBaseAccessService) {}

  async list(
    query: KnowledgeBaseListQuery,
    user: AuthenticatedUser,
  ): Promise<KnowledgeBaseListResponse> {
    const rows = await db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        description: knowledgeBases.description,
        departmentId: knowledgeBases.departmentId,
        departmentName: departments.name,
        visibility: knowledgeBases.visibility,
        status: knowledgeBases.status,
        indexStatus: knowledgeBases.indexStatus,
        creatorId: knowledgeBases.creatorId,
        creatorName: creator.name,
        embeddingModel: knowledgeBases.embeddingModel,
        embeddingDimension: knowledgeBases.embeddingDimension,
        createdAt: knowledgeBases.createdAt,
        updatedAt: knowledgeBases.updatedAt,
      })
      .from(knowledgeBases)
      .innerJoin(departments, eq(departments.id, knowledgeBases.departmentId))
      .innerJoin(creator, eq(creator.id, knowledgeBases.creatorId))
      .where(this.buildListCondition(query, user))
      .orderBy(desc(knowledgeBases.updatedAt), asc(knowledgeBases.name));

    const items = await Promise.all(
      rows.map(async (row) => this.toKnowledgeBase(row, await this.accessService.canManage(row.id, user))),
    );
    return { items };
  }

  async create(
    input: CreateKnowledgeBaseRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeBase> {
    await this.ensureCanCreateInDepartment(input.departmentId, user);

    const [created] = await db.transaction(async (tx) => {
      const [knowledgeBase] = await tx
        .insert(knowledgeBases)
        .values({
          name: input.name,
          description: input.description ?? null,
          departmentId: input.departmentId,
          visibility: input.visibility,
          creatorId: user.id,
        })
        .returning({
          id: knowledgeBases.id,
        });

      if (knowledgeBase === undefined) {
        throw new BadRequestException("Failed to create knowledge base");
      }

      await tx.insert(knowledgeBaseAdmins).values({
        knowledgeBaseId: knowledgeBase.id,
        userId: user.id,
      });

      return [knowledgeBase];
    });

    return this.get(created.id, user);
  }

  async get(id: string, user: AuthenticatedUser): Promise<KnowledgeBase> {
    await this.ensureCanAccess(id, user);
    const row = await this.findRowById(id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge base not found");
    }

    return this.toKnowledgeBase(row, await this.accessService.canManage(id, user));
  }

  async update(
    id: string,
    input: UpdateKnowledgeBaseRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeBase> {
    await this.ensureCanManage(id, user);

    const updateValues: Partial<typeof knowledgeBases.$inferInsert> = {};
    if (input.name !== undefined) {
      updateValues.name = input.name;
    }
    if (input.description !== undefined) {
      updateValues.description = input.description;
    }
    if (input.visibility !== undefined) {
      updateValues.visibility = input.visibility;
    }
    if (input.status !== undefined) {
      updateValues.status = input.status;
    }

    await db
      .update(knowledgeBases)
      .set({ ...updateValues, updatedAt: new Date() })
      .where(eq(knowledgeBases.id, id));

    return this.get(id, user);
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    await this.ensureCanManage(id, user);

    const [{ value: documentCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(documents)
      .where(eq(documents.knowledgeBaseId, id));
    if (documentCount > 0) {
      throw new BadRequestException("Cannot delete a knowledge base that has documents");
    }

    await db.transaction(async (tx) => {
      await tx.delete(knowledgeBaseMembers).where(eq(knowledgeBaseMembers.knowledgeBaseId, id));
      await tx.delete(knowledgeBaseAdmins).where(eq(knowledgeBaseAdmins.knowledgeBaseId, id));
      await tx.delete(metadataFields).where(eq(metadataFields.knowledgeBaseId, id));
      await tx.delete(tags).where(eq(tags.knowledgeBaseId, id));
      await tx.delete(knowledgeBases).where(eq(knowledgeBases.id, id));
    });
  }

  private buildListCondition(
    query: KnowledgeBaseListQuery,
    user: AuthenticatedUser,
  ): SQL | undefined {
    const conditions: SQL[] = [];
    const accessCondition = this.accessService.buildAccessCondition(user);
    if (accessCondition !== undefined) {
      conditions.push(accessCondition);
    }
    if (query.status !== undefined) {
      conditions.push(eq(knowledgeBases.status, query.status));
    }
    if (query.visibility !== undefined) {
      conditions.push(eq(knowledgeBases.visibility, query.visibility));
    }
    if (query.keyword !== undefined) {
      const keywordCondition = or(
        ilike(knowledgeBases.name, `%${query.keyword}%`),
        ilike(knowledgeBases.description, `%${query.keyword}%`),
      );
      if (keywordCondition !== undefined) {
        conditions.push(keywordCondition);
      }
    }

    return conditions.length === 0 ? undefined : and(...conditions);
  }

  private async ensureCanCreateInDepartment(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    const department = await db.query.departments.findFirst({
      where: eq(departments.id, departmentId),
      columns: {
        id: true,
      },
    });
    if (department === undefined) {
      throw new BadRequestException("Department not found");
    }

    if (user.platformRole === "super_admin") {
      return;
    }

    if (user.platformRole === "department_admin" && user.departmentId === departmentId) {
      return;
    }

    throw new ForbiddenException("Cannot create knowledge base in this department");
  }

  private async ensureCanAccess(id: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canAccess(id, user)) {
      return;
    }

    throw new NotFoundException("Knowledge base not found");
  }

  private async ensureCanManage(id: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(id, user)) {
      return;
    }

    throw new ForbiddenException("Cannot manage this knowledge base");
  }

  private async findRowById(id: string): Promise<KnowledgeBaseRow | undefined> {
    const [row] = await db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        description: knowledgeBases.description,
        departmentId: knowledgeBases.departmentId,
        departmentName: departments.name,
        visibility: knowledgeBases.visibility,
        status: knowledgeBases.status,
        indexStatus: knowledgeBases.indexStatus,
        creatorId: knowledgeBases.creatorId,
        creatorName: creator.name,
        embeddingModel: knowledgeBases.embeddingModel,
        embeddingDimension: knowledgeBases.embeddingDimension,
        createdAt: knowledgeBases.createdAt,
        updatedAt: knowledgeBases.updatedAt,
      })
      .from(knowledgeBases)
      .innerJoin(departments, eq(departments.id, knowledgeBases.departmentId))
      .innerJoin(creator, eq(creator.id, knowledgeBases.creatorId))
      .where(eq(knowledgeBases.id, id))
      .limit(1);

    return row;
  }

  private toKnowledgeBase(row: KnowledgeBaseRow, canManage: boolean): KnowledgeBase {
    return {
      ...row,
      canManage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
