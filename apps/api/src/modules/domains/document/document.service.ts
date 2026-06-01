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
  documents,
  files,
  parentChunks,
  users,
} from "@knowflow/db";
import type {
  DocumentListResponse,
  DocumentSourceType,
  KnowledgeDocument,
} from "@knowflow/shared";
import { asc, count, eq } from "drizzle-orm";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {} from "multer";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { createDocumentQueue } from "./document-queue.js";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

type UploadedFile = Express.Multer.File;

type FileKind = {
  sourceType: Extract<DocumentSourceType, "pdf" | "markdown" | "txt">;
  extension: ".pdf" | ".md" | ".txt";
};

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

@Injectable()
export class DocumentService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
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
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new BadRequestException("Document file exceeds 20 MB");
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
        await queue.add("process", { documentId: created.id }, { attempts: 2, backoff: { type: "exponential", delay: 5000 } });
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
    user: AuthenticatedUser,
  ): Promise<DocumentListResponse> {
    await this.ensureCanAccess(knowledgeBaseId, user);

    const rows = await db
      .select(this.documentSelection())
      .from(documents)
      .innerJoin(users, eq(users.id, documents.uploaderId))
      .where(eq(documents.knowledgeBaseId, knowledgeBaseId))
      .orderBy(asc(documents.createdAt));

    return { items: await this.toDocuments(rows) };
  }

  async get(id: string, user: AuthenticatedUser): Promise<KnowledgeDocument> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanAccess(row.knowledgeBaseId, user);

    return this.toDocument(row, await this.countChunks(id));
  }

  async delete(id: string, user: AuthenticatedUser): Promise<void> {
    const row = await this.findRow(id);
    if (row === undefined) {
      throw new NotFoundException("Document not found");
    }
    await this.ensureCanManage(row.knowledgeBaseId, user);

    const [file] = row.fileId === null
      ? []
      : await db.select({ storagePath: files.storagePath }).from(files).where(eq(files.id, row.fileId)).limit(1);

    await db.transaction(async (tx) => {
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

  private detectFileKind(file: UploadedFile): FileKind {
    const extension = path.extname(file.originalname).toLowerCase();
    if (extension === ".pdf" || file.mimetype === "application/pdf") {
      return { sourceType: "pdf", extension: ".pdf" };
    }
    if (extension === ".md" || extension === ".markdown" || file.mimetype === "text/markdown") {
      return { sourceType: "markdown", extension: ".md" };
    }
    if (extension === ".txt" || file.mimetype === "text/plain") {
      return { sourceType: "txt", extension: ".txt" };
    }

    throw new BadRequestException("Only PDF, Markdown, and TXT files are supported");
  }

  private async storeFile(
    knowledgeBaseId: string,
    file: UploadedFile,
    extension: FileKind["extension"],
  ): Promise<string> {
    const storageRoot = path.resolve(process.env["LOCAL_STORAGE_ROOT"] ?? "storage");
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
    const storageRoot = path.resolve(process.env["LOCAL_STORAGE_ROOT"] ?? "storage");
    const absolutePath = path.resolve(storageRoot, storagePath);
    if (!this.isWithinDirectory(storageRoot, absolutePath)) {
      return;
    }
    await rm(absolutePath, { force: true });
  }

  private isWithinDirectory(root: string, target: string): boolean {
    const relativePath = path.relative(root, target);
    return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
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

  private async toDocuments(rows: DocumentRow[]): Promise<KnowledgeDocument[]> {
    return Promise.all(rows.map(async (row) => this.toDocument(row, await this.countChunks(row.id))));
  }

  private async countChunks(documentId: string): Promise<{
    parentChunkCount: number;
    childChunkCount: number;
  }> {
    const [[{ value: parentChunkCount } = { value: 0 }], [{ value: childChunkCount } = { value: 0 }]] =
      await Promise.all([
        db.select({ value: count() }).from(parentChunks).where(eq(parentChunks.documentId, documentId)),
        db.select({ value: count() }).from(childChunks).where(eq(childChunks.documentId, documentId)),
      ]);
    return { parentChunkCount, childChunkCount };
  }

  private toDocument(
    row: DocumentRow,
    counts: { parentChunkCount: number; childChunkCount: number },
  ): KnowledgeDocument {
    return {
      ...row,
      ...counts,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
