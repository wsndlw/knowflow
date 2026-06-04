import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  childChunks,
  db,
  documentTags,
  documents,
  files,
  knowledgeImprovementTasks,
  knowledgeItems,
  knowledgeItemFeedback,
  messageCitations,
  parentChunks,
  tags,
  users,
} from "@knowflow/db";
import type {
  DocumentChunkItem,
  DocumentChunksQuery,
  DocumentChunksResponse,
  DocumentContentResponse,
  DocumentFileQuery,
  DocumentListQuery,
  DocumentListResponse,
  DocumentProgressEvent,
  KnowledgeTag,
  KnowledgeDocument,
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
  min,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type ReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {} from "multer";
import { Observable } from "rxjs";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import {
  detectDocumentUploadKind,
  MAX_DOCUMENT_UPLOAD_BYTES,
  validateDocumentUploadContent,
  type DocumentUploadKind,
} from "../../../shared/upload/upload-file-validation.js";
import { resolveLocalStorageRoot } from "../../../shared/storage/local-storage.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { createDocumentQueue } from "./document-queue.js";
import { createRedisClient, getDocumentProgressChannel } from "./document-progress.js";

type UploadedFile = Express.Multer.File;
type FileKind = DocumentUploadKind;

type DocumentRow = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: KnowledgeDocument["sourceType"];
  sourceUri: string | null;
  fileId: string | null;
  fileType: string | null;
  fileSize: number | null;
  uploaderId: string;
  uploaderName: string;
  processStatus: KnowledgeDocument["processStatus"];
  parseStatus: KnowledgeDocument["parseStatus"];
  chunkStatus: KnowledgeDocument["chunkStatus"];
  embeddingStatus: KnowledgeDocument["embeddingStatus"];
  enabled: boolean;
  metadata: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type DocumentFileStream = {
  stream: ReadStream;
  filename: string;
  fileType: string;
  fileSize: number;
  disposition: DocumentFileQuery["disposition"];
};

type OrderedParentChunkRow = {
  id: string;
  documentId: string;
  content: string;
};

type TagRow = {
  id: string;
  knowledgeBaseId: string;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
};

type ChunkCounts = {
  parentChunkCount: number;
  childChunkCount: number;
};

const DOCUMENT_PROCESS_VERSION_KEY = "__processVersion";

@Injectable()
export class DocumentService {
  private static readonly CONTENT_PREVIEW_MAX_CHARS = 100_000;
  private static readonly CONTENT_PREVIEW_BATCH_SIZE = 50;

  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
    @Inject(AnalyticsEventService)
    private readonly analytics: AnalyticsEventService,
  ) {}

  async upload(
    knowledgeBaseId: string,
    file: UploadedFile | undefined,
    user: AuthenticatedUser,
  ): Promise<KnowledgeDocument> {
    await this.ensureCanManage(knowledgeBaseId, user);
    if (file === undefined) {
      throw new BadRequestException("Document file is required");
    }
    if (file.size <= 0) {
      throw new BadRequestException("Document file is empty");
    }
    if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) {
      throw new BadRequestException("Document file exceeds 10 MB");
    }

    const kind = this.detectFileKind(file);
    const storagePath = await this.storeFile(knowledgeBaseId, file, kind.extension);
    const hash = createHash("sha256").update(file.buffer).digest("hex");
    const originalFilename = this.decodeMultipartFilename(file.originalname);
    const title = this.normalizeTitle(originalFilename);

    let createdDocumentId: string | undefined;
    let createdFileId: string | undefined;
    try {
      const [created] = await db.transaction(async (tx) => {
        const [storedFile] = await tx
          .insert(files)
          .values({
            storagePath,
            filename: originalFilename,
            fileType: file.mimetype,
            fileSize: file.size,
            hash,
            uploaderId: user.id,
          })
          .returning({ id: files.id });
        if (storedFile === undefined) {
          throw new BadRequestException("Failed to store file metadata");
        }
        createdFileId = storedFile.id;

        const [document] = await tx
          .insert(documents)
          .values({
            knowledgeBaseId,
            title,
            sourceType: kind.sourceType,
            sourceUri: storagePath,
            fileId: storedFile.id,
            fileType: file.mimetype,
            fileSize: file.size,
            uploaderId: user.id,
            processStatus: "pending",
            parseStatus: "pending",
            chunkStatus: "pending",
            embeddingStatus: "pending",
            metadata: { processVersion: 1 },
          })
          .returning({ id: documents.id });
        if (document === undefined) {
          throw new BadRequestException("Failed to create document");
        }
        createdDocumentId = document.id;

        return [document];
      });

      await this.enqueueProcessJob(created.id, 1);

      return await this.get(created.id, user);
    } catch (error) {
      if (createdDocumentId !== undefined || createdFileId !== undefined) {
        await db.transaction(async (tx) => {
          if (createdDocumentId !== undefined) {
            await tx.delete(documents).where(eq(documents.id, createdDocumentId));
          }
          if (createdFileId !== undefined) {
            await tx.delete(files).where(eq(files.id, createdFileId));
          }
        });
      }
      await this.removeStoredFile(storagePath);
      throw error;
    }
  }

  async list(
    knowledgeBaseId: string,
    query: DocumentListQuery,
    user: AuthenticatedUser,
  ): Promise<DocumentListResponse> {
    await this.ensureCanAccess(knowledgeBaseId, user);

    const condition = this.buildListCondition(knowledgeBaseId, query);
    const offset = (query.page - 1) * query.pageSize;
    const [[{ value: total } = { value: 0 }], rows] = await Promise.all([
      db.select({ value: count() }).from(documents).where(condition),
      db
        .select(this.documentSelection())
        .from(documents)
        .innerJoin(users, eq(users.id, documents.uploaderId))
        .where(condition)
        .orderBy(desc(documents.createdAt))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const documentIds = rows.map((row) => row.id);
    const [tagsByDocumentId, countsByDocumentId] = await Promise.all([
      this.fetchTagsByDocumentIds(documentIds),
      this.fetchChunkCountsByDocumentIds(documentIds),
    ]);

    return {
      items: this.toDocuments(rows, tagsByDocumentId, countsByDocumentId),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async get(id: string, user: AuthenticatedUser): Promise<KnowledgeDocument> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanAccess(row.knowledgeBaseId, user);

    await this.analytics.recordSafe({
      user,
      eventType: "document_viewed",
      targetType: "document",
      targetId: id,
      knowledgeBaseId: row.knowledgeBaseId,
    });

    const tagsByDocumentId = await this.fetchTagsByDocumentIds([id]);
    return this.toDocument(row, await this.countChunks(id), tagsByDocumentId.get(id) ?? []);
  }

  async getContent(id: string, user: AuthenticatedUser): Promise<DocumentContentResponse> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanAccess(row.knowledgeBaseId, user);

    const contentPreview = await this.buildContentPreview(id);
    const storedTextLength = this.readParsedTextLength(row.metadata);
    const textLength = storedTextLength ?? contentPreview.previewLength;

    return {
      documentId: row.id,
      title: row.title,
      text: contentPreview.text,
      textLength,
      truncated: contentPreview.truncated || textLength > DocumentService.CONTENT_PREVIEW_MAX_CHARS,
      parseStatus: row.parseStatus,
    };
  }

  async listChunks(
    id: string,
    query: DocumentChunksQuery,
    user: AuthenticatedUser,
  ): Promise<DocumentChunksResponse> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanAccess(row.knowledgeBaseId, user);

    return query.level === "parent"
      ? this.listParentChunks(id, query)
      : this.listChildChunks(id, query);
  }

  async openFile(
    id: string,
    query: DocumentFileQuery,
    user: AuthenticatedUser,
  ): Promise<DocumentFileStream> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanAccess(row.knowledgeBaseId, user);
    if (row.fileId === null) {
      throw new NotFoundException("Document has no original file");
    }

    const [file] = await db
      .select({
        storagePath: files.storagePath,
        filename: files.filename,
        fileType: files.fileType,
        fileSize: files.fileSize,
      })
      .from(files)
      .where(eq(files.id, row.fileId))
      .limit(1);
    if (file === undefined) {
      throw new NotFoundException("Document file not found");
    }

    const absolutePath = this.resolveStoredFilePath(file.storagePath);
    try {
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        throw new NotFoundException("Document file not found");
      }
    } catch {
      throw new NotFoundException("Document file not found");
    }

    return {
      stream: createReadStream(absolutePath),
      filename: file.filename,
      fileType: file.fileType,
      fileSize: file.fileSize,
      disposition: query.disposition,
    };
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    const [file] =
      row.fileId === null
        ? []
        : await db
            .select({ storagePath: files.storagePath })
            .from(files)
            .where(eq(files.id, row.fileId))
            .limit(1);

    await db.transaction(async (tx) => {
      const sourceItems = await tx
        .select({ id: knowledgeItems.id })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.sourceDocumentId, id));
      const sourceItemIds = sourceItems.map((item) => item.id);

      await tx
        .update(messageCitations)
        .set({ documentId: null })
        .where(eq(messageCitations.documentId, id));
      if (sourceItemIds.length > 0) {
        await tx
          .update(messageCitations)
          .set({ knowledgeItemId: null })
          .where(inArray(messageCitations.knowledgeItemId, sourceItemIds));
        await tx
          .delete(knowledgeImprovementTasks)
          .where(
            or(
              inArray(knowledgeImprovementTasks.publishedItemId, sourceItemIds),
              sql`${knowledgeImprovementTasks.sourceContext}->>'documentId' = ${id}`,
            ),
          );
        await tx
          .delete(knowledgeItemFeedback)
          .where(inArray(knowledgeItemFeedback.knowledgeItemId, sourceItemIds));
        await tx.delete(knowledgeItems).where(inArray(knowledgeItems.id, sourceItemIds));
      } else {
        await tx
          .delete(knowledgeImprovementTasks)
          .where(sql`${knowledgeImprovementTasks.sourceContext}->>'documentId' = ${id}`);
      }
      await tx.delete(childChunks).where(eq(childChunks.documentId, id));
      await tx.delete(parentChunks).where(eq(parentChunks.documentId, id));
      await tx.delete(documents).where(eq(documents.id, id));
      if (row.fileId !== null) {
        await tx.delete(files).where(eq(files.id, row.fileId));
      }
    });

    if (file !== undefined) {
      await this.removeStoredFile(file.storagePath);
    }
  }

  async archive(id: string, user: AuthenticatedUser): Promise<KnowledgeDocument> {
    return this.setEnabled(id, user, false);
  }

  async restore(id: string, user: AuthenticatedUser): Promise<KnowledgeDocument> {
    return this.setEnabled(id, user, true);
  }

  async reprocess(id: string, user: AuthenticatedUser): Promise<KnowledgeDocument> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);
    if (
      row.processStatus === "pending" ||
      row.processStatus === "parsing" ||
      row.processStatus === "chunking" ||
      row.processStatus === "embedding"
    ) {
      throw new BadRequestException("Document is already being processed");
    }

    const [previousParentChunks, previousChildChunks] = await Promise.all([
      db.select().from(parentChunks).where(eq(parentChunks.documentId, id)),
      db.select().from(childChunks).where(eq(childChunks.documentId, id)),
    ]);

    const nextProcessVersion = this.readProcessVersion(row.metadata) + 1;
    const nextMetadata = {
      ...this.readMetadataObject(row.metadata),
      processVersion: nextProcessVersion,
      reprocessRequestedAt: new Date().toISOString(),
    };

    await db.transaction(async (tx) => {
      await tx.delete(childChunks).where(eq(childChunks.documentId, id));
      await tx.delete(parentChunks).where(eq(parentChunks.documentId, id));
      await tx
        .update(documents)
        .set({
          processStatus: "pending",
          parseStatus: "pending",
          chunkStatus: "pending",
          embeddingStatus: "pending",
          metadata: nextMetadata,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));
    });

    try {
      await this.enqueueProcessJob(id, nextProcessVersion);
    } catch (error) {
      await db.transaction(async (tx) => {
        if (previousParentChunks.length > 0) {
          await tx.insert(parentChunks).values(previousParentChunks);
        }
        if (previousChildChunks.length > 0) {
          await tx.insert(childChunks).values(previousChildChunks);
        }
        await tx
          .update(documents)
          .set({
            processStatus: row.processStatus,
            parseStatus: row.parseStatus,
            chunkStatus: row.chunkStatus,
            embeddingStatus: row.embeddingStatus,
            metadata: row.metadata,
            errorMessage: row.errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, id));
      });
      throw error;
    }

    const updated = await this.findRow(id);
    if (updated === undefined) {
      throw new NotFoundException("Document not found");
    }
    const tagsByDocumentId = await this.fetchTagsByDocumentIds([id]);
    return this.toDocument(updated, await this.countChunks(id), tagsByDocumentId.get(id) ?? []);
  }

  createProgressStream(documentId: string): Observable<DocumentProgressEvent> {
    return new Observable<DocumentProgressEvent>((subscriber) => {
      const redis = createRedisClient();
      const channel = getDocumentProgressChannel(documentId);

      void this.findRow(documentId).then((row) => {
        if (row !== undefined && !subscriber.closed) {
          subscriber.next(this.toProgressEvent(row));
        }
      });

      redis.on("message", (_channel, payload) => {
        if (_channel !== channel) {
          return;
        }
        try {
          subscriber.next(JSON.parse(payload) as DocumentProgressEvent);
        } catch {
          subscriber.error(new Error("Invalid progress payload"));
        }
      });
      redis.on("error", (error) => subscriber.error(error));
      void redis.subscribe(channel);

      return () => {
        void redis.unsubscribe(channel).finally(() => redis.disconnect());
      };
    });
  }

  private async ensureCanAccess(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Document not found");
  }

  private async ensureCanManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("Cannot manage documents in this knowledge base");
  }

  private buildListCondition(knowledgeBaseId: string, query: DocumentListQuery): SQL | undefined {
    const conditions: SQL[] = [eq(documents.knowledgeBaseId, knowledgeBaseId)];
    conditions.push(eq(documents.enabled, !(query.archived ?? false)));
    if (query.keyword !== undefined) {
      conditions.push(ilike(documents.title, `%${query.keyword}%`));
    }
    if (query.status !== undefined) {
      conditions.push(eq(documents.processStatus, query.status));
    }
    for (const tagId of query.tagIds) {
      conditions.push(
        exists(
          db
            .select({ id: documentTags.id })
            .from(documentTags)
            .where(and(eq(documentTags.documentId, documents.id), eq(documentTags.tagId, tagId))),
        ),
      );
    }

    return and(...conditions);
  }

  private async setEnabled(
    id: string,
    user: AuthenticatedUser,
    enabled: boolean,
  ): Promise<KnowledgeDocument> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    await db
      .update(documents)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(documents.id, id));

    const updated = await this.findRow(id);
    if (updated === undefined) {
      throw new NotFoundException("Document not found");
    }
    const tagsByDocumentId = await this.fetchTagsByDocumentIds([id]);
    return this.toDocument(updated, await this.countChunks(id), tagsByDocumentId.get(id) ?? []);
  }

  private detectFileKind(file: UploadedFile): FileKind {
    const kind = detectDocumentUploadKind(file);
    if (kind === null) {
      throw new BadRequestException(
        "Only PDF, Markdown, TXT, DOCX, CSV, XLSX, XLS, and image files with matching MIME types are supported",
      );
    }
    if (!validateDocumentUploadContent(file, kind)) {
      throw new BadRequestException("Document file content does not match its declared type");
    }
    return kind;
  }

  private async storeFile(
    knowledgeBaseId: string,
    file: UploadedFile,
    extension: FileKind["extension"],
  ): Promise<string> {
    const storageRoot = resolveLocalStorageRoot();
    const now = new Date();
    const relativeDirectory = path.join(
      "documents",
      knowledgeBaseId,
      String(now.getUTCFullYear()),
      String(now.getUTCMonth() + 1).padStart(2, "0"),
    );
    const absoluteDirectory = path.resolve(storageRoot, relativeDirectory);
    if (!this.isWithinDirectory(storageRoot, absoluteDirectory)) {
      throw new BadRequestException("Invalid storage path");
    }

    await mkdir(absoluteDirectory, { recursive: true });
    const filename = `${randomUUID()}${extension}`;
    const absolutePath = path.resolve(absoluteDirectory, filename);
    if (!this.isWithinDirectory(storageRoot, absolutePath)) {
      throw new BadRequestException("Invalid storage path");
    }

    await writeFile(absolutePath, file.buffer);
    return path.join(relativeDirectory, filename).replaceAll(path.sep, "/");
  }

  private async removeStoredFile(storagePath: string): Promise<void> {
    const storageRoot = resolveLocalStorageRoot();
    const absolutePath = path.resolve(storageRoot, storagePath);
    if (!this.isWithinDirectory(storageRoot, absolutePath)) {
      return;
    }
    await rm(absolutePath, { force: true });
  }

  private isWithinDirectory(root: string, target: string): boolean {
    const relativePath = path.relative(root, target);
    return (
      relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
    );
  }

  private normalizeTitle(originalName: string): string {
    const parsed = path.parse(originalName);
    const title = (parsed.name || originalName).trim();
    return title.length > 0 ? title.slice(0, 255) : "Untitled document";
  }

  private decodeMultipartFilename(originalName: string): string {
    const decoded = Buffer.from(originalName, "latin1").toString("utf8");
    return decoded.includes("\uFFFD") ? originalName : decoded;
  }

  private async findRow(id: string): Promise<DocumentRow | undefined> {
    const [row] = await db
      .select(this.documentSelection())
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploaderId))
      .where(eq(documents.id, id))
      .limit(1);
    return row;
  }

  private documentSelection() {
    return {
      id: documents.id,
      knowledgeBaseId: documents.knowledgeBaseId,
      title: documents.title,
      sourceType: documents.sourceType,
      sourceUri: documents.sourceUri,
      fileId: documents.fileId,
      fileType: documents.fileType,
      fileSize: documents.fileSize,
      uploaderId: documents.uploaderId,
      uploaderName: users.name,
      processStatus: documents.processStatus,
      parseStatus: documents.parseStatus,
      chunkStatus: documents.chunkStatus,
      embeddingStatus: documents.embeddingStatus,
      enabled: documents.enabled,
      metadata: documents.metadata,
      errorMessage: documents.errorMessage,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
    };
  }

  private async fetchTagsByDocumentIds(
    documentIds: string[],
  ): Promise<Map<string, KnowledgeTag[]>> {
    const byDocumentId = new Map<string, KnowledgeTag[]>();
    if (documentIds.length === 0) {
      return byDocumentId;
    }

    const rows = await db
      .select({
        documentId: documentTags.documentId,
        id: tags.id,
        knowledgeBaseId: tags.knowledgeBaseId,
        name: tags.name,
        color: tags.color,
        createdAt: tags.createdAt,
        updatedAt: tags.updatedAt,
      })
      .from(documentTags)
      .innerJoin(tags, eq(tags.id, documentTags.tagId))
      .where(inArray(documentTags.documentId, documentIds))
      .orderBy(asc(tags.name));

    for (const row of rows) {
      const current = byDocumentId.get(row.documentId) ?? [];
      current.push(this.toTag(row));
      byDocumentId.set(row.documentId, current);
    }

    return byDocumentId;
  }

  private toDocuments(
    rows: DocumentRow[],
    tagsByDocumentId: Map<string, KnowledgeTag[]>,
    countsByDocumentId: Map<string, ChunkCounts>,
  ): KnowledgeDocument[] {
    return rows.map((row) =>
      this.toDocument(
        row,
        countsByDocumentId.get(row.id) ?? { parentChunkCount: 0, childChunkCount: 0 },
        tagsByDocumentId.get(row.id) ?? [],
      ),
    );
  }

  private async countChunks(documentId: string): Promise<ChunkCounts> {
    const [
      [{ value: parentChunkCount } = { value: 0 }],
      [{ value: childChunkCount } = { value: 0 }],
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(parentChunks)
        .where(eq(parentChunks.documentId, documentId)),
      db.select({ value: count() }).from(childChunks).where(eq(childChunks.documentId, documentId)),
    ]);
    return { parentChunkCount, childChunkCount };
  }

  private async fetchChunkCountsByDocumentIds(
    documentIds: string[],
  ): Promise<Map<string, ChunkCounts>> {
    const byDocumentId = new Map<string, ChunkCounts>();
    if (documentIds.length === 0) {
      return byDocumentId;
    }

    const [parentRows, childRows] = await Promise.all([
      db
        .select({
          documentId: parentChunks.documentId,
          value: count(),
        })
        .from(parentChunks)
        .where(inArray(parentChunks.documentId, documentIds))
        .groupBy(parentChunks.documentId),
      db
        .select({
          documentId: childChunks.documentId,
          value: count(),
        })
        .from(childChunks)
        .where(inArray(childChunks.documentId, documentIds))
        .groupBy(childChunks.documentId),
    ]);

    for (const documentId of documentIds) {
      byDocumentId.set(documentId, { parentChunkCount: 0, childChunkCount: 0 });
    }
    for (const row of parentRows) {
      const current = byDocumentId.get(row.documentId) ?? {
        parentChunkCount: 0,
        childChunkCount: 0,
      };
      current.parentChunkCount = row.value;
      byDocumentId.set(row.documentId, current);
    }
    for (const row of childRows) {
      const current = byDocumentId.get(row.documentId) ?? {
        parentChunkCount: 0,
        childChunkCount: 0,
      };
      current.childChunkCount = row.value;
      byDocumentId.set(row.documentId, current);
    }

    return byDocumentId;
  }

  private async listParentChunks(
    documentId: string,
    query: DocumentChunksQuery,
  ): Promise<DocumentChunksResponse> {
    const offset = (query.page - 1) * query.pageSize;
    const [[{ value: total } = { value: 0 }], rows] = await Promise.all([
      db
        .select({ value: count() })
        .from(parentChunks)
        .where(eq(parentChunks.documentId, documentId)),
      this.fetchOrderedParentChunks(documentId, query.pageSize, offset),
    ]);

    return {
      items: rows.map(
        (chunk, index): DocumentChunkItem => ({
          id: chunk.id,
          documentId: chunk.documentId,
          level: "parent",
          seq: offset + index,
          content: chunk.content,
          parentId: null,
          tokenCount: null,
        }),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private async listChildChunks(
    documentId: string,
    query: DocumentChunksQuery,
  ): Promise<DocumentChunksResponse> {
    const offset = (query.page - 1) * query.pageSize;
    const [[{ value: total } = { value: 0 }], rows] = await Promise.all([
      db.select({ value: count() }).from(childChunks).where(eq(childChunks.documentId, documentId)),
      db
        .select({
          id: childChunks.id,
          documentId: childChunks.documentId,
          content: childChunks.content,
          parentId: childChunks.parentChunkId,
          seq: childChunks.chunkIndex,
          tokenCount: childChunks.tokenCount,
        })
        .from(childChunks)
        .where(eq(childChunks.documentId, documentId))
        .orderBy(asc(childChunks.chunkIndex), asc(childChunks.id))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    return {
      items: rows.map(
        (chunk): DocumentChunkItem => ({
          id: chunk.id,
          documentId: chunk.documentId,
          level: "child",
          seq: chunk.seq,
          content: chunk.content,
          parentId: chunk.parentId,
          tokenCount: chunk.tokenCount,
        }),
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private toDocument(
    row: DocumentRow,
    counts: { parentChunkCount: number; childChunkCount: number },
    tagItems: KnowledgeTag[],
  ): KnowledgeDocument {
    return {
      id: row.id,
      knowledgeBaseId: row.knowledgeBaseId,
      title: row.title,
      sourceType: row.sourceType,
      sourceUri: row.sourceUri,
      fileId: row.fileId,
      fileType: row.fileType,
      fileSize: row.fileSize,
      uploaderId: row.uploaderId,
      uploaderName: row.uploaderName,
      processStatus: row.processStatus,
      parseStatus: row.parseStatus,
      chunkStatus: row.chunkStatus,
      embeddingStatus: row.embeddingStatus,
      enabled: row.enabled,
      errorMessage: row.errorMessage,
      parentChunkCount: counts.parentChunkCount,
      childChunkCount: counts.childChunkCount,
      tags: tagItems,
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

  private toProgressEvent(row: DocumentRow): DocumentProgressEvent {
    return {
      documentId: row.id,
      stage: row.processStatus,
      percent: this.progressPercent(row.processStatus),
      message: row.errorMessage ?? `Document status: ${row.processStatus}`,
      timestamp: new Date().toISOString(),
    };
  }

  private progressPercent(status: KnowledgeDocument["processStatus"]): number {
    switch (status) {
      case "pending":
        return 5;
      case "parsing":
        return 15;
      case "chunking":
        return 35;
      case "embedding":
        return 60;
      case "completed":
      case "failed":
        return 100;
    }
  }

  private readParsedTextLength(metadata: unknown): number | undefined {
    if (
      metadata !== null &&
      typeof metadata === "object" &&
      "textLength" in metadata &&
      typeof metadata.textLength === "number" &&
      Number.isInteger(metadata.textLength) &&
      metadata.textLength >= 0
    ) {
      return metadata.textLength;
    }
    return undefined;
  }

  private readProcessVersion(metadata: unknown): number {
    const value = this.readMetadataObject(metadata)["processVersion"];
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
  }

  private readMetadataObject(metadata: unknown): Record<string, unknown> {
    return metadata !== null && typeof metadata === "object" && !Array.isArray(metadata)
      ? { ...metadata }
      : {};
  }

  private async enqueueProcessJob(documentId: string, processVersion: number): Promise<void> {
    const queue = createDocumentQueue();
    try {
      await queue.add(
        "process",
        { documentId: this.encodeProcessJobDocumentId(documentId, processVersion) },
        {
          jobId: `document-process-${documentId}-${String(processVersion)}`,
          attempts: 2,
          backoff: { type: "exponential", delay: 5000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      );
    } finally {
      await queue.close();
    }
  }

  private encodeProcessJobDocumentId(documentId: string, processVersion: number): string {
    return `${documentId}${DOCUMENT_PROCESS_VERSION_KEY}${String(processVersion)}`;
  }

  private resolveStoredFilePath(storagePath: string): string {
    const storageRoot = resolveLocalStorageRoot();
    const absolutePath = path.resolve(storageRoot, storagePath);
    if (!this.isWithinDirectory(storageRoot, absolutePath)) {
      throw new NotFoundException("Document file not found");
    }
    return absolutePath;
  }

  private async buildContentPreview(documentId: string): Promise<{
    text: string;
    previewLength: number;
    truncated: boolean;
  }> {
    const parts: string[] = [];
    let previewLength = 0;
    let offset = 0;
    let truncated = false;

    for (;;) {
      const chunks = await this.fetchOrderedParentChunks(
        documentId,
        DocumentService.CONTENT_PREVIEW_BATCH_SIZE,
        offset,
      );
      if (chunks.length === 0) {
        break;
      }

      for (const chunk of chunks) {
        const separatorLength = parts.length === 0 ? 0 : 2;
        const nextLength = previewLength + separatorLength + chunk.content.length;
        if (nextLength > DocumentService.CONTENT_PREVIEW_MAX_CHARS) {
          const separatorFits =
            separatorLength > 0 &&
            previewLength + separatorLength <= DocumentService.CONTENT_PREVIEW_MAX_CHARS;
          if (separatorFits) {
            parts.push("\n\n");
            previewLength += separatorLength;
          }
          const remaining = DocumentService.CONTENT_PREVIEW_MAX_CHARS - previewLength;
          if (remaining > 0) {
            parts.push(chunk.content.slice(0, remaining));
            previewLength += remaining;
          }
          truncated = true;
          return {
            text: parts.join(""),
            previewLength,
            truncated,
          };
        }

        if (separatorLength > 0) {
          parts.push("\n\n");
          previewLength += separatorLength;
        }
        parts.push(chunk.content);
        previewLength = nextLength;
      }

      if (chunks.length < DocumentService.CONTENT_PREVIEW_BATCH_SIZE) {
        break;
      }
      offset += chunks.length;
    }

    return {
      text: parts.join(""),
      previewLength,
      truncated,
    };
  }

  private async fetchOrderedParentChunks(
    documentId: string,
    limit: number,
    offset: number,
  ): Promise<OrderedParentChunkRow[]> {
    return db
      .select({
        id: parentChunks.id,
        documentId: parentChunks.documentId,
        content: parentChunks.content,
        firstChildIndex: min(childChunks.chunkIndex),
      })
      .from(parentChunks)
      .leftJoin(childChunks, eq(childChunks.parentChunkId, parentChunks.id))
      .where(eq(parentChunks.documentId, documentId))
      .groupBy(parentChunks.id, parentChunks.documentId, parentChunks.content)
      .orderBy(asc(min(childChunks.chunkIndex)), asc(parentChunks.createdAt), asc(parentChunks.id))
      .limit(limit)
      .offset(offset);
  }
}
