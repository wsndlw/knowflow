import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import {
  db,
  documents,
  knowledgeBases,
  knowledgeImprovementTasks,
  messageCitations,
  knowledgeItemFeedback,
  knowledgeItemTags,
  knowledgeItems,
  tags,
} from "@knowflow/db";
import type {
  BatchImportResponse,
  CreateKnowledgeItemRequest,
  KnowledgeTag,
  KnowledgeItem,
  KnowledgeItemFeedbackRequest,
  KnowledgeItemListQuery,
  KnowledgeItemListResponse,
  UpdateKnowledgeItemRequest,
} from "@knowflow/shared";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";

import { AliyunLlmService, EXPECTED_EMBEDDING_DIMENSION } from "../../../shared/llm/aliyun-llm.js";
import { parseSpreadsheetForBatchImport } from "../../../shared/import/spreadsheet-import.js";
import {
  detectBatchImportKind,
  MAX_BATCH_IMPORT_BYTES,
  validateBatchImportContent,
} from "../../../shared/upload/upload-file-validation.js";
import { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";

type UploadedFile = Express.Multer.File;

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

type TagRow = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class KnowledgeItemService {
  private readonly logger = new Logger(KnowledgeItemService.name);

  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
    @Inject(AliyunLlmService)
    private readonly llm: AliyunLlmService,
    @Inject(AnalyticsEventService)
    private readonly analytics: AnalyticsEventService,
    @Inject(KnowledgeImprovementService)
    private readonly improvementService: KnowledgeImprovementService,
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

    if (query.keyword !== undefined) {
      await this.analytics.recordSafe({
        user,
        eventType: "knowledge_searched",
        targetType: "knowledge_base",
        targetId: knowledgeBaseId,
        knowledgeBaseId,
        metadata: {
          keyword: query.keyword,
          resultCount: total,
        },
      });
    }

    const tagsByItemId = await this.fetchTagsByKnowledgeItemIds(rows.map((row) => row.id));

    return {
      items: rows.map((row) => this.toKnowledgeItem(row, tagsByItemId.get(row.id) ?? [])),
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

  async batchImport(
    knowledgeBaseId: string,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
  ): Promise<BatchImportResponse> {
    await this.ensureCanManage(knowledgeBaseId, user);
    if (file === undefined) {
      throw new BadRequestException("Import file is required");
    }
    if (file.size <= 0) {
      throw new BadRequestException("Import file is empty");
    }
    if (file.size > MAX_BATCH_IMPORT_BYTES) {
      throw new BadRequestException("Import file exceeds 10 MB");
    }
    const kind = this.detectImportFileKind(file);

    let parsed: Awaited<ReturnType<typeof parseSpreadsheetForBatchImport>>;
    try {
      parsed = await parseSpreadsheetForBatchImport(file.buffer, kind);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : "Import file is invalid",
      );
    }
    if (parsed.rows.length === 0) {
      return { imported: 0, skipped: parsed.skipped, errors: parsed.errors };
    }

    const inserted = await db
      .insert(knowledgeItems)
      .values(
        parsed.rows.map((row) => ({
          knowledgeBaseId,
          title: row.title,
          content: row.content,
          summary: row.summary,
          status: "draft" as const,
          enabled: false,
          metadata: {
            source: "batch_import",
            fileName: file.originalname,
            row: row.row,
          },
          createdBy: user.id,
          updatedBy: user.id,
        })),
      )
      .returning({ id: knowledgeItems.id });

    return {
      imported: inserted.length,
      skipped: parsed.skipped,
      errors: parsed.errors,
    };
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
      await this.analytics.recordSafe({
        user,
        eventType: "knowledge_item_viewed",
        targetType: "knowledge_item",
        targetId: id,
        knowledgeBaseId: row.knowledgeBaseId,
      });
      return this.get(id, user, { incrementView: false });
    }

    const tagsByItemId = await this.fetchTagsByKnowledgeItemIds([id]);
    return this.toKnowledgeItem(row, tagsByItemId.get(id) ?? []);
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

  async archive(id: string, user: AuthenticatedUser): Promise<KnowledgeItem> {
    const row = await this.findRow(id, user.id);
    if (row === undefined) {
      throw new NotFoundException("Knowledge item not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    await db
      .update(knowledgeItems)
      .set({
        status: "archived",
        enabled: false,
        updatedBy: user.id,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeItems.id, id));

    return this.get(id, user, { incrementView: false });
  }

  async restore(id: string, user: AuthenticatedUser): Promise<KnowledgeItem> {
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
        .delete(knowledgeImprovementTasks)
        .where(eq(knowledgeImprovementTasks.publishedItemId, id));
      await tx.delete(knowledgeItemFeedback).where(eq(knowledgeItemFeedback.knowledgeItemId, id));
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

    const feedbackIdToImprove = await db.transaction(async (tx): Promise<string | null> => {
      const previousRating = row.userFeedback;
      let createdDislikeFeedbackId: string | null = null;
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
        const [createdFeedback] = await tx
          .insert(knowledgeItemFeedback)
          .values({
            knowledgeItemId: id,
            userId: user.id,
            rating: input.rating,
          })
          .returning({ id: knowledgeItemFeedback.id });
        if (input.rating === "dislike" && previousRating !== "dislike") {
          createdDislikeFeedbackId = createdFeedback?.id ?? null;
        }
      }

      const likeDelta = (input.rating === "like" ? 1 : 0) - (previousRating === "like" ? 1 : 0);
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

      return createdDislikeFeedbackId;
    });

    await this.analytics.recordSafe({
      user,
      eventType: "feedback_submitted",
      targetType: "knowledge_item",
      targetId: id,
      knowledgeBaseId: row.knowledgeBaseId,
      metadata: {
        rating: input.rating,
      },
    });

    if (feedbackIdToImprove !== null) {
      await this.triggerImmediateImprovement(feedbackIdToImprove, id);
    }

    return this.get(id, user, { incrementView: false });
  }

  private async triggerImmediateImprovement(feedbackId: string, knowledgeItemId: string): Promise<void> {
    try {
      await this.improvementService.triggerFromItemFeedback(feedbackId);
    } catch (error) {
      this.logger.warn(
        `Knowledge item ${knowledgeItemId} disliked, but immediate improvement enqueue failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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
    } else {
      conditions.push(ne(knowledgeItems.status, "archived"));
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
    for (const tagId of query.tagIds) {
      conditions.push(
        exists(
          db
            .select({ id: knowledgeItemTags.id })
            .from(knowledgeItemTags)
            .where(
              and(
                eq(knowledgeItemTags.knowledgeItemId, knowledgeItems.id),
                eq(knowledgeItemTags.tagId, tagId),
              ),
            ),
        ),
      );
    }

    return and(...conditions);
  }

  private async fetchTagsByKnowledgeItemIds(
    knowledgeItemIds: string[],
  ): Promise<Map<string, KnowledgeTag[]>> {
    const byItemId = new Map<string, KnowledgeTag[]>();
    if (knowledgeItemIds.length === 0) {
      return byItemId;
    }

    const rows = await db
      .select({
        knowledgeItemId: knowledgeItemTags.knowledgeItemId,
        id: tags.id,
        knowledgeBaseId: tags.knowledgeBaseId,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
      })
      .from(knowledgeItemTags)
      .innerJoin(tags, eq(tags.id, knowledgeItemTags.tagId))
      .where(inArray(knowledgeItemTags.knowledgeItemId, knowledgeItemIds))
      .orderBy(asc(tags.name));

    for (const row of rows) {
      const current = byItemId.get(row.knowledgeItemId) ?? [];
      current.push(this.toTag(row));
      byItemId.set(row.knowledgeItemId, current);
    }

    return byItemId;
  }

  private async findRow(id: string, userId: string): Promise<KnowledgeItemRow | undefined> {
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

  private detectImportFileKind(file: UploadedFile): "csv" | "excel" {
    const kind = detectBatchImportKind(file);
    if (kind === null) {
      throw new BadRequestException(
        "Only CSV, XLSX, and XLS files with matching MIME types are supported for batch import",
      );
    }
    if (!validateBatchImportContent(file, kind)) {
      throw new BadRequestException("Import file content does not match its declared type");
    }
    return kind;
  }

  private async ensureCanAccess(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Knowledge item not found");
  }

  private async ensureCanReadRow(row: KnowledgeItemRow, user: AuthenticatedUser): Promise<void> {
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

  private async ensureCanManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("Cannot manage knowledge items in this knowledge base");
  }

  private toKnowledgeItem(row: KnowledgeItemRow, tagItems: KnowledgeTag[]): KnowledgeItem {
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
      tags: tagItems,
      createdBy: row.createdBy,
      updatedBy: row.updatedBy,
      verifiedBy: row.verifiedBy,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toTag(row: TagRow): KnowledgeTag {
    return {
      ...row,
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
