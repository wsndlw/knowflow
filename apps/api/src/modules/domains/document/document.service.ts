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
  knowledgeItems,
  parentChunks,
  tags,
  users,
} from "@knowflow/db";
import type {
  DocumentListQuery,
  DocumentListResponse,
  DocumentProgressEvent,
  KnowledgeTag,
  KnowledgeDocument,
} from "@knowflow/shared";
import { and, asc, count, desc, eq, exists, ilike, inArray, type SQL } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
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
  errorMessage: string | null;
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
export class DocumentService {
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
    const title = this.normalizeTitle(file.originalname);

    let createdDocumentId: string | undefined;
    let createdFileId: string | undefined;
    try {
      const [created] = await db.transaction(async (tx) => {
        const [storedFile] = await tx
          .insert(files)
          .values({
            storagePath,
            filename: file.originalname,
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
          })
          .returning({ id: documents.id });
        if (document === undefined) {
          throw new BadRequestException("Failed to create document");
        }
        createdDocumentId = document.id;

        return [document];
      });

      const queue = createDocumentQueue();
      try {
        await queue.add(
          "process",
          { documentId: created.id },
          { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
        );
      } finally {
        await queue.close();
      }

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

    const tagsByDocumentId = await this.fetchTagsByDocumentIds(rows.map((row) => row.id));

    return {
      items: await this.toDocuments(rows, tagsByDocumentId),
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
      await tx
        .update(knowledgeItems)
        .set({
          sourceDocumentId: null,
          updatedAt: new Date(),
        })
        .where(eq(knowledgeItems.sourceDocumentId, id));
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
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(documents.id, id));
    });

    const queue = createDocumentQueue();
    try {
      await queue.add(
        "process",
        { documentId: id },
        { attempts: 2, backoff: { type: "exponential", delay: 5000 } },
      );
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
            errorMessage: row.errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, id));
      });
      throw error;
    } finally {
      await queue.close();
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

  private async toDocuments(
    rows: DocumentRow[],
    tagsByDocumentId: Map<string, KnowledgeTag[]>,
  ): Promise<KnowledgeDocument[]> {
    return Promise.all(
      rows.map(async (row) =>
        this.toDocument(row, await this.countChunks(row.id), tagsByDocumentId.get(row.id) ?? []),
      ),
    );
  }

  private async countChunks(documentId: string): Promise<{
    parentChunkCount: number;
    childChunkCount: number;
  }> {
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

  private toDocument(
    row: DocumentRow,
    counts: { parentChunkCount: number; childChunkCount: number },
    tagItems: KnowledgeTag[],
  ): KnowledgeDocument {
    return {
      ...row,
      ...counts,
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
}
