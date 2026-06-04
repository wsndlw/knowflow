import {
  BadRequestException,
  ForbiddenException,
  Inject,
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
  knowledgeItems,
  users,
} from "@knowflow/db";
import type {
  CreateKnowledgeBaseRequest,
  DepartmentOptionsResponse,
  KnowledgeBase,
  KnowledgeBaseListItem,
  KnowledgeBaseListQuery,
  KnowledgeBaseListResponse,
  KnowledgeBaseMember,
  KnowledgeBaseMembersResponse,
  KnowledgeBaseOverview,
  UpdateKnowledgeBaseRequest,
  UserOptionsResponse,
} from "@knowflow/shared";
import { and, asc, count, desc, eq, ilike, inArray, ne, or, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AnalyticsEventService } from "../analytics/analytics-event.service.js";
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

type KnowledgeBaseListCounts = {
  documentCount: number;
  knowledgeItemCount: number;
  memberCount: number;
};

type MemberRow = {
  id: string;
  username: string;
  name: string;
  platformRole: KnowledgeBaseMember["platformRole"];
  departmentId: string;
  departmentName: string;
  joinedAt: Date | null;
  adminSince: Date | null;
};

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
    @Inject(AnalyticsEventService)
    private readonly analytics: AnalyticsEventService,
  ) {}

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

    const [manageableIds, countByKnowledgeBaseId] = await Promise.all([
      this.listManageableIds(
        rows.map((row) => row.id),
        user,
      ),
      this.listCountsByKnowledgeBaseId(rows.map((row) => row.id)),
    ]);

    const items = rows.map((row) =>
      this.toKnowledgeBaseListItem(
        row,
        manageableIds.has(row.id),
        countByKnowledgeBaseId.get(row.id) ?? this.emptyListCounts(),
      ),
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
    const row = await this.findRowById(id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge base not found");
    }
    const canManage = await this.ensureCanReadRow(row, user);

    await this.analytics.recordSafe({
      user,
      eventType: "knowledge_base_viewed",
      targetType: "knowledge_base",
      targetId: id,
      knowledgeBaseId: id,
    });

    return this.toKnowledgeBase(row, canManage);
  }

  async getOverview(id: string, user: AuthenticatedUser): Promise<KnowledgeBaseOverview> {
    await this.ensureCanAccess(id, user);

    const [
      [{ value: documentCount } = { value: 0 }],
      [{ value: knowledgeItemCount } = { value: 0 }],
      [{ value: publishedKnowledgeItemCount } = { value: 0 }],
      [{ value: memberCount } = { value: 0 }],
      documentStatusRows,
      knowledgeItemStatusRows,
    ] = await Promise.all([
      db.select({ value: count() }).from(documents).where(eq(documents.knowledgeBaseId, id)),
      db
        .select({ value: count() })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.knowledgeBaseId, id)),
      db
        .select({ value: count() })
        .from(knowledgeItems)
        .where(
          and(eq(knowledgeItems.knowledgeBaseId, id), eq(knowledgeItems.status, "published")),
        ),
      db
        .select({ value: count() })
        .from(knowledgeBaseMembers)
        .where(eq(knowledgeBaseMembers.knowledgeBaseId, id)),
      db
        .select({
          status: documents.processStatus,
          value: count(),
        })
        .from(documents)
        .where(eq(documents.knowledgeBaseId, id))
        .groupBy(documents.processStatus),
      db
        .select({
          status: knowledgeItems.status,
          value: count(),
        })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.knowledgeBaseId, id))
        .groupBy(knowledgeItems.status),
    ]);

    return {
      documentCount,
      knowledgeItemCount,
      publishedKnowledgeItemCount,
      memberCount,
      documentStatusCounts: Object.fromEntries(
        documentStatusRows.map((row) => [row.status, row.value]),
      ),
      knowledgeItemStatusCounts: Object.fromEntries(
        knowledgeItemStatusRows.map((row) => [row.status, row.value]),
      ),
    };
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
    await db
      .update(knowledgeBases)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(knowledgeBases.id, id));
  }

  async listDepartmentOptions(user: AuthenticatedUser): Promise<DepartmentOptionsResponse> {
    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
      })
      .from(departments)
      .where(
        user.platformRole === "super_admin"
          ? undefined
          : eq(departments.id, user.departmentId),
      )
      .orderBy(asc(departments.name));

    return { items: rows };
  }

  async listUserOptions(id: string, user: AuthenticatedUser): Promise<UserOptionsResponse> {
    await this.ensureCanManage(id, user);
    const knowledgeBase = await this.findRowById(id);
    if (knowledgeBase === undefined) {
      throw new NotFoundException("Knowledge base not found");
    }

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        platformRole: users.platformRole,
        departmentId: users.departmentId,
        departmentName: departments.name,
      })
      .from(users)
      .innerJoin(departments, eq(departments.id, users.departmentId))
      .where(this.buildUserOptionsCondition(user, knowledgeBase.departmentId))
      .orderBy(asc(users.name), asc(users.username));

    return { items: rows };
  }

  async listMembers(id: string, user: AuthenticatedUser): Promise<KnowledgeBaseMembersResponse> {
    await this.ensureCanManage(id, user);

    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        platformRole: users.platformRole,
        departmentId: users.departmentId,
        departmentName: departments.name,
        joinedAt: knowledgeBaseMembers.createdAt,
        adminSince: knowledgeBaseAdmins.createdAt,
      })
      .from(users)
      .innerJoin(departments, eq(departments.id, users.departmentId))
      .leftJoin(
        knowledgeBaseMembers,
        and(
          eq(knowledgeBaseMembers.userId, users.id),
          eq(knowledgeBaseMembers.knowledgeBaseId, id),
        ),
      )
      .leftJoin(
        knowledgeBaseAdmins,
        and(
          eq(knowledgeBaseAdmins.userId, users.id),
          eq(knowledgeBaseAdmins.knowledgeBaseId, id),
        ),
      )
      .where(
        or(
          eq(knowledgeBaseMembers.knowledgeBaseId, id),
          eq(knowledgeBaseAdmins.knowledgeBaseId, id),
        ),
      )
      .orderBy(asc(users.name), asc(users.username));

    return {
      items: rows.map((row) => this.toMember(row)),
    };
  }

  async addMember(id: string, memberUserId: string, user: AuthenticatedUser): Promise<void> {
    await this.ensureCanManage(id, user);
    await this.ensureUserExists(memberUserId);

    await db
      .insert(knowledgeBaseMembers)
      .values({
        knowledgeBaseId: id,
        userId: memberUserId,
      })
      .onConflictDoNothing({
        target: [knowledgeBaseMembers.knowledgeBaseId, knowledgeBaseMembers.userId],
      });
  }

  async removeMember(id: string, memberUserId: string, user: AuthenticatedUser): Promise<void> {
    await this.ensureCanManage(id, user);
    await db
      .delete(knowledgeBaseMembers)
      .where(
        and(
          eq(knowledgeBaseMembers.knowledgeBaseId, id),
          eq(knowledgeBaseMembers.userId, memberUserId),
        ),
      );
  }

  async addAdmin(id: string, adminUserId: string, user: AuthenticatedUser): Promise<void> {
    await this.ensureCanManage(id, user);
    await this.ensureUserExists(adminUserId);

    await db.transaction(async (tx) => {
      await tx
        .insert(knowledgeBaseMembers)
        .values({
          knowledgeBaseId: id,
          userId: adminUserId,
        })
        .onConflictDoNothing({
          target: [knowledgeBaseMembers.knowledgeBaseId, knowledgeBaseMembers.userId],
        });
      await tx
        .insert(knowledgeBaseAdmins)
        .values({
          knowledgeBaseId: id,
          userId: adminUserId,
        })
        .onConflictDoNothing({
          target: [knowledgeBaseAdmins.knowledgeBaseId, knowledgeBaseAdmins.userId],
        });
    });
  }

  async removeAdmin(id: string, adminUserId: string, user: AuthenticatedUser): Promise<void> {
    await this.ensureCanManage(id, user);

    await db.transaction(async (tx) => {
      const [{ value: adminCount } = { value: 0 }] = await tx
        .select({ value: count() })
        .from(knowledgeBaseAdmins)
        .where(eq(knowledgeBaseAdmins.knowledgeBaseId, id));

      if (adminCount <= 1) {
        throw new BadRequestException("Knowledge base must keep at least one admin");
      }

      await tx
        .delete(knowledgeBaseAdmins)
        .where(
          and(
            eq(knowledgeBaseAdmins.knowledgeBaseId, id),
            eq(knowledgeBaseAdmins.userId, adminUserId),
          ),
        );
    });
  }

  private buildListCondition(
    query: KnowledgeBaseListQuery,
    user: AuthenticatedUser,
  ): SQL | undefined {
    const conditions: SQL[] = [];
    const accessCondition =
      query.status === "archived"
        ? this.accessService.buildManageCondition(user)
        : this.accessService.buildAccessCondition(user);
    if (accessCondition !== undefined) {
      conditions.push(accessCondition);
    }
    if (query.status !== undefined) {
      conditions.push(eq(knowledgeBases.status, query.status));
    } else {
      conditions.push(ne(knowledgeBases.status, "archived"));
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

  private buildUserOptionsCondition(
    user: AuthenticatedUser,
    knowledgeBaseDepartmentId: string,
  ): SQL | undefined {
    if (user.platformRole === "super_admin") {
      return undefined;
    }
    if (user.platformRole === "department_admin") {
      return eq(users.departmentId, user.departmentId);
    }

    return eq(users.departmentId, knowledgeBaseDepartmentId);
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

  private async ensureUserExists(userId: string): Promise<void> {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        id: true,
      },
    });

    if (user === undefined) {
      throw new BadRequestException("User not found");
    }
  }

  private async ensureCanAccess(id: string, user: AuthenticatedUser): Promise<void> {
    const row = await this.findRowById(id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge base not found");
    }

    await this.ensureCanReadRow(row, user);
  }

  private async ensureCanReadRow(
    row: KnowledgeBaseRow,
    user: AuthenticatedUser,
  ): Promise<boolean> {
    const canManage = await this.accessService.canManage(row.id, user);
    if (row.status === "archived") {
      if (canManage) {
        return true;
      }
      throw new NotFoundException("Knowledge base not found");
    }

    if (canManage || (await this.accessService.canAccess(row.id, user))) {
      return canManage;
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

  private async listManageableIds(
    knowledgeBaseIds: string[],
    user: AuthenticatedUser,
  ): Promise<Set<string>> {
    if (knowledgeBaseIds.length === 0) {
      return new Set();
    }

    const condition = this.accessService.buildManageCondition(user);
    const rows = await db
      .select({ id: knowledgeBases.id })
      .from(knowledgeBases)
      .where(
        condition === undefined
          ? inArray(knowledgeBases.id, knowledgeBaseIds)
          : and(inArray(knowledgeBases.id, knowledgeBaseIds), condition),
      );

    return new Set(rows.map((row) => row.id));
  }

  private async listCountsByKnowledgeBaseId(
    knowledgeBaseIds: string[],
  ): Promise<Map<string, KnowledgeBaseListCounts>> {
    const countByKnowledgeBaseId = new Map<string, KnowledgeBaseListCounts>();
    for (const id of knowledgeBaseIds) {
      countByKnowledgeBaseId.set(id, this.emptyListCounts());
    }

    if (knowledgeBaseIds.length === 0) {
      return countByKnowledgeBaseId;
    }

    const [documentRows, knowledgeItemRows, memberRows] = await Promise.all([
      db
        .select({
          knowledgeBaseId: documents.knowledgeBaseId,
          value: count(),
        })
        .from(documents)
        .where(inArray(documents.knowledgeBaseId, knowledgeBaseIds))
        .groupBy(documents.knowledgeBaseId),
      db
        .select({
          knowledgeBaseId: knowledgeItems.knowledgeBaseId,
          value: count(),
        })
        .from(knowledgeItems)
        .where(inArray(knowledgeItems.knowledgeBaseId, knowledgeBaseIds))
        .groupBy(knowledgeItems.knowledgeBaseId),
      db
        .select({
          knowledgeBaseId: knowledgeBaseMembers.knowledgeBaseId,
          value: count(),
        })
        .from(knowledgeBaseMembers)
        .where(inArray(knowledgeBaseMembers.knowledgeBaseId, knowledgeBaseIds))
        .groupBy(knowledgeBaseMembers.knowledgeBaseId),
    ]);

    for (const row of documentRows) {
      countByKnowledgeBaseId.set(row.knowledgeBaseId, {
        ...(countByKnowledgeBaseId.get(row.knowledgeBaseId) ?? this.emptyListCounts()),
        documentCount: row.value,
      });
    }
    for (const row of knowledgeItemRows) {
      countByKnowledgeBaseId.set(row.knowledgeBaseId, {
        ...(countByKnowledgeBaseId.get(row.knowledgeBaseId) ?? this.emptyListCounts()),
        knowledgeItemCount: row.value,
      });
    }
    for (const row of memberRows) {
      countByKnowledgeBaseId.set(row.knowledgeBaseId, {
        ...(countByKnowledgeBaseId.get(row.knowledgeBaseId) ?? this.emptyListCounts()),
        memberCount: row.value,
      });
    }

    return countByKnowledgeBaseId;
  }

  private emptyListCounts(): KnowledgeBaseListCounts {
    return {
      documentCount: 0,
      knowledgeItemCount: 0,
      memberCount: 0,
    };
  }

  private toKnowledgeBase(row: KnowledgeBaseRow, canManage: boolean): KnowledgeBase {
    return {
      ...row,
      canManage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toKnowledgeBaseListItem(
    row: KnowledgeBaseRow,
    canManage: boolean,
    counts: KnowledgeBaseListCounts,
  ): KnowledgeBaseListItem {
    return {
      ...this.toKnowledgeBase(row, canManage),
      ...counts,
    };
  }

  private toMember(row: MemberRow): KnowledgeBaseMember {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      platformRole: row.platformRole,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
      isAdmin: row.adminSince !== null,
      joinedAt: row.joinedAt?.toISOString() ?? null,
      adminSince: row.adminSince?.toISOString() ?? null,
    };
  }
}
