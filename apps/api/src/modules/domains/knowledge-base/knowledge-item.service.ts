import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  db,
  documents,
  knowledgeBases,
  messageCitations,
  knowledgeItemFeedback,
  knowledgeItems,
} from "@knowflow/db";
import type {
  CreateKnowledgeItemRequest,
  KnowledgeItem,
  KnowledgeItemFeedbackRequest,
  KnowledgeItemListQuery,
  KnowledgeItemListResponse,
  UpdateKnowledgeItemRequest,
} from "@knowflow/shared";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";

import { AliyunLlmService, EXPECTED_EMBEDDING_DIMENSION } from "../../../shared/llm/aliyun-llm.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";

type KnowledgeItemRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  title: string;
  content: string;
  summary: string | null;
  sourceDocumentId: string | null;
  status: KnowledgeItem["status"];
  metadata: unknown;
  enabled: boolean;
  viewCount: number;
  citeCount: number;
  likeCount: number;
  dislikeCount: number;
  userFeedback: KnowledgeItem["userFeedback"];
  createdBy: string;
  updatedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class KnowledgeItemService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
    @Inject(AliyunLlmService)
    private readonly llm: AliyunLlmService,
  ) {}

  async listByKnowledgeBase(
    knowledgeBaseId: string,
    query: KnowledgeItemListQuery,
    user: AuthenticatedUser,
  ): Promise<KnowledgeItemListResponse> {
    await this.ensureCanAccess(knowledgeBaseId, user);
    const canManage = await this.accessService.canManage(knowledgeBaseId, user);

    const condition = this.buildListCondition(knowledgeBaseId, query, canManage);
    const offset = (query.page - 1) * query.pageSize;
    const [[{ value: total } = { value: 0 }], rows] = await Promise.all([
      db.select({ value: count() }).from(knowledgeItems).where(condition),
      db
        .select(this.selection())
        .from(knowledgeItems)
        .innerJoin(knowledgeBases, eq(knowledgeBases.id, knowledgeItems.knowledgeBaseId))
        .leftJoin(
          knowledgeItemFeedback,
          and(
            eq(knowledgeItemFeedback.knowledgeItemId, knowledgeItems.id),
            eq(knowledgeItemFeedback.userId, user.id),
          ),
        )
        .where(condition)
        .orderBy(desc(knowledgeItems.updatedAt), asc(knowledgeItems.title))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    return {
      items: rows.map((row) => this.toKnowledgeItem(row)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async create(
    knowledgeBaseId: string,
    input: CreateKnowledgeItemRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeItem> {
    await this.ensureCanManage(knowledgeBaseId, user);
    await this.ensureSourceDocumentBelongsToKnowledgeBase(
      input.sourceDocumentId ?? null,
      knowledgeBaseId,
    );

    const [created] = await db
      .insert(knowledgeItems)
      .values({
        knowledgeBaseId,
        title: input.title,
        content: input.content,
        summary: input.summary ?? null,
        sourceDocumentId: input.sourceDocumentId ?? null,
        status: "draft",
        metadata: input.metadata ?? {},
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning({ id: knowledgeItems.id });
    if (created === undefined) {
      throw new BadRequestException("Failed to create knowledge item");
    }

    return this.get(created.id, user, { incrementView: false });
  }

  async get(
    id: string,
    user: AuthenticatedUser,
    options: { incrementView?: boolean } = {},
  ): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanReadRow(row, user);

    if (options.incrementView ?? true) {
      await db
        .update(knowledgeItems)
        .set({
          viewCount: sql`${knowledgeItems.viewCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeItems.id, id));
      return this.get(id, user, { incrementView: false });
    }

    return this.toKnowledgeItem(row);
  }

  async update(
    id: string,
    input: UpdateKnowledgeItemRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);
    await this.ensureSourceDocumentBelongsToKnowledgeBase(
      input.sourceDocumentId ?? undefined,
      row.knowledgeBaseId,
    );

    const values: Partial<typeof knowledgeItems.$inferInsert> = {};
    if (input.title !== undefined) {
      values.title = input.title;
    }
    if (input.content !== undefined) {
      values.content = input.content;
    }
    if (input.summary !== undefined) {
      values.summary = input.summary;
    }
    if (input.sourceDocumentId !== undefined) {
      values.sourceDocumentId = input.sourceDocumentId;
    }
    if (input.metadata !== undefined) {
      values.metadata = input.metadata;
    }
    if (input.status !== undefined) {
      values.status = input.status;
    }
    if (input.enabled !== undefined) {
      values.enabled = input.enabled;
    }

    await db
      .update(knowledgeItems)
      .set({ ...values, updatedBy: user.id, updatedAt: new Date() })
      .where(eq(knowledgeItems.id, id));

    return this.get(id, user, { incrementView: false });
  }

  async publish(id: string, user: AuthenticatedUser): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    const [embedding] = await this.llm.embedTexts([this.embeddingText(row)]);
    if (embedding?.length !== EXPECTED_EMBEDDING_DIMENSION) {
      throw new BadRequestException("Knowledge item embedding failed");
    }

    await db
      .update(knowledgeItems)
      .set({
        embedding,
        searchVector: sql`to_tsvector('simple', ${this.searchText(row)})`,
        status: "published",
        enabled: true,
        verifiedBy: user.id,
        verifiedAt: new Date(),
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeItems.id, id));

    return this.get(id, user, { incrementView: false });
  }

  async unpublish(id: string, user: AuthenticatedUser): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    await db
      .update(knowledgeItems)
      .set({
        status: "unpublished",
        enabled: false,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeItems.id, id));

    return this.get(id, user, { incrementView: false });
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    await db.transaction(async (tx) => {
      await tx
        .update(messageCitations)
        .set({ knowledgeItemId: null })
        .where(eq(messageCitations.knowledgeItemId, id));
      await tx
        .delete(knowledgeItemFeedback)
        .where(eq(knowledgeItemFeedback.knowledgeItemId, id));
      await tx.delete(knowledgeItems).where(eq(knowledgeItems.id, id));
    });
  }

  async setFeedback(
    id: string,
    input: KnowledgeItemFeedbackRequest,
    user: AuthenticatedUser,
  ): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanReadRow(row, user);

    await db.transaction(async (tx) => {
      const previousRating = row.userFeedback;
      if (previousRating !== null) {
        await tx
          .delete(knowledgeItemFeedback)
          .where(
            and(
              eq(knowledgeItemFeedback.knowledgeItemId, id),
              eq(knowledgeItemFeedback.userId, user.id),
            ),
          );
      }

      if (input.rating !== null) {
        await tx.insert(knowledgeItemFeedback).values({
          knowledgeItemId: id,
          userId: user.id,
          rating: input.rating,
        });
      }

      const likeDelta =
        (input.rating === "like" ? 1 : 0) - (previousRating === "like" ? 1 : 0);
      const dislikeDelta =
        (input.rating === "dislike" ? 1 : 0) - (previousRating === "dislike" ? 1 : 0);
      if (likeDelta !== 0 || dislikeDelta !== 0) {
        await tx
          .update(knowledgeItems)
          .set({
            likeCount: sql`greatest(0, ${knowledgeItems.likeCount} + ${likeDelta})`,
            dislikeCount: sql`greatest(0, ${knowledgeItems.dislikeCount} + ${dislikeDelta})`,
            updatedAt: new Date(),
          })
          .where(eq(knowledgeItems.id, id));
      }
    });

    return this.get(id, user, { incrementView: false });
  }

  private buildListCondition(
    knowledgeBaseId: string,
    query: KnowledgeItemListQuery,
    canManage: boolean,
  ): SQL | undefined {
    const conditions: SQL[] = [eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId)];
    if (!canManage) {
      conditions.push(eq(knowledgeItems.status, "published"), eq(knowledgeItems.enabled, true));
    } else if (query.status !== undefined) {
      conditions.push(eq(knowledgeItems.status, query.status));
    }
    if (query.keyword !== undefined) {
      const keyword = `%${query.keyword}%`;
      const keywordCondition = or(
        ilike(knowledgeItems.title, keyword),
        ilike(knowledgeItems.content, keyword),
      );
      if (keywordCondition !== undefined) {
        conditions.push(keywordCondition);
      }
    }

    return and(...conditions);
  }

  private async findRow(
    id: string,
    userId: string,
  ): Promise<KnowledgeItemRow | undefined> {
    const [row] = await db
      .select(this.selection())
      .from(knowledgeItems)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, knowledgeItems.knowledgeBaseId))
      .leftJoin(
        knowledgeItemFeedback,
        and(
          eq(knowledgeItemFeedback.knowledgeItemId, knowledgeItems.id),
          eq(knowledgeItemFeedback.userId, userId),
        ),
      )
      .where(eq(knowledgeItems.id, id))
      .limit(1);

    return row;
  }

  private selection() {
    return {
      id: knowledgeItems.id,
      knowledgeBaseId: knowledgeItems.knowledgeBaseId,
      knowledgeBaseName: knowledgeBases.name,
      title: knowledgeItems.title,
      content: knowledgeItems.content,
      summary: knowledgeItems.summary,
      sourceDocumentId: knowledgeItems.sourceDocumentId,
      status: knowledgeItems.status,
      metadata: knowledgeItems.metadata,
      enabled: knowledgeItems.enabled,
      viewCount: knowledgeItems.viewCount,
      citeCount: knowledgeItems.citeCount,
      likeCount: knowledgeItems.likeCount,
      dislikeCount: knowledgeItems.dislikeCount,
      userFeedback: knowledgeItemFeedback.rating,
      createdBy: knowledgeItems.createdBy,
      updatedBy: knowledgeItems.updatedBy,
      verifiedBy: knowledgeItems.verifiedBy,
      verifiedAt: knowledgeItems.verifiedAt,
      createdAt: knowledgeItems.createdAt,
      updatedAt: knowledgeItems.updatedAt,
    };
  }

  private async ensureSourceDocumentBelongsToKnowledgeBase(
    documentId: string | null | undefined,
    knowledgeBaseId: string,
  ): Promise<void> {
    if (documentId === undefined || documentId === null) {
      return;
    }

    const [document] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, documentId), eq(documents.knowledgeBaseId, knowledgeBaseId)))
      .limit(1);
    if (document === undefined) {
      throw new BadRequestException("Source document not found in this knowledge base");
    }
  }

  private async ensureCanAccess(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Knowledge item not found");
  }

  private async ensureCanReadRow(
    row: KnowledgeItemRow,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (!(await this.accessService.canAccess(row.knowledgeBaseId, user))) {
      throw new NotFoundException("Knowledge item not found");
    }
    if (row.status === "published" && row.enabled) {
      return;
    }
    if (await this.accessService.canManage(row.knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Knowledge item not found");
  }

  private async ensureCanManage(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("Cannot manage knowledge items in this knowledge base");
  }

  private toKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
    return {
      id: row.id,
      knowledgeBaseId: row.knowledgeBaseId,
      knowledgeBaseName: row.knowledgeBaseName,
      title: row.title,
      content: row.content,
      summary: row.summary,
      sourceDocumentId: row.sourceDocumentId,
      status: row.status,
      metadata:
        row.metadata !== null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {},
      enabled: row.enabled,
      viewCount: row.viewCount,
      citeCount: row.citeCount,
      likeCount: row.likeCount,
      dislikeCount: row.dislikeCount,
      userFeedback: row.userFeedback,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private embeddingText(row: Pick<KnowledgeItemRow, "title" | "summary" | "content">): string {
    return [row.title, row.summary, row.content].filter(Boolean).join("\n\n");
  }

  private searchText(row: Pick<KnowledgeItemRow, "title" | "summary" | "content">): string {
    return [row.title, row.summary, row.content].filter(Boolean).join(" ");
  }
}
