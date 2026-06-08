import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  MessageEvent,
  Param,
  Post,
  Query,
  Req,
  Res,
  Sse,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  AuditTargetType,
  documentChunksQuerySchema,
  documentChunksResponseSchema,
  documentContentResponseSchema,
  documentFileQuerySchema,
  documentListResponseSchema,
  documentListQuerySchema,
  documentProgressEventSchema,
  documentSchema,
  uuidParamSchema,
  type DocumentChunksResponse,
  type DocumentContentResponse,
  type DocumentListResponse,
  type KnowledgeDocument,
} from "@knowflow/shared";
import type {} from "multer";
import { Observable } from "rxjs";

import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import {
  detectDocumentUploadKind,
  MAX_DOCUMENT_UPLOAD_BYTES,
} from "../../../shared/upload/upload-file-validation.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { DocumentService } from "./document.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

type DocumentSuccess = {
  ok: true;
  data: KnowledgeDocument;
};

type DocumentListSuccess = {
  ok: true;
  data: DocumentListResponse;
};

type DocumentContentSuccess = {
  ok: true;
  data: DocumentContentResponse;
};

type DocumentChunksSuccess = {
  ok: true;
  data: DocumentChunksResponse;
};

type FileResponse = {
  setHeader: (name: string, value: string | number) => void;
};

@Controller()
export class DocumentController {
  constructor(
    @Inject(DocumentService)
    private readonly documentService: DocumentService,
  ) {}

  @Post("knowledge-bases/:id/documents")
  @AuditLog("document.upload", AuditTargetType.DOCUMENT)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_DOCUMENT_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        if (detectDocumentUploadKind(file) !== null) {
          callback(null, true);
          return;
        }
        callback(
          new BadRequestException(
            "仅支持 PDF、Markdown、TXT、DOCX、CSV、XLSX、XLS 以及 MIME 类型匹配的图片文件",
          ),
          false,
        );
      },
    }),
  )
  async upload(
    @Param() params: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.upload(id, file, this.requireUser(request));
    return { ok: true, data: documentSchema.parse(data) };
  }

  @Get("knowledge-bases/:id/documents")
  async list(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentListSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.list(
      id,
      documentListQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: documentListResponseSchema.parse(data) };
  }

  @Get("documents/:id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.get(id, this.requireUser(request));
    return { ok: true, data: documentSchema.parse(data) };
  }

  @Get("documents/:id/content")
  async getContent(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentContentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.getContent(id, this.requireUser(request));
    return { ok: true, data: documentContentResponseSchema.parse(data) };
  }

  @Get("documents/:id/chunks")
  async listChunks(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentChunksSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.listChunks(
      id,
      documentChunksQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: documentChunksResponseSchema.parse(data) };
  }

  @Get("documents/:id/file")
  async openFile(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: FileResponse,
  ): Promise<StreamableFile> {
    const { id } = uuidParamSchema.parse(params);
    const file = await this.documentService.openFile(
      id,
      documentFileQuerySchema.parse(query),
      this.requireUser(request),
    );

    response.setHeader("Content-Type", file.fileType);
    response.setHeader("Content-Length", file.fileSize);
    response.setHeader(
      "Content-Disposition",
      this.contentDisposition(file.disposition, file.filename),
    );

    return new StreamableFile(file.stream);
  }

  @Sse("documents/:id/progress")
  async progress(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    const { id } = uuidParamSchema.parse(params);
    await this.documentService.get(id, this.requireUser(request));
    return this.documentService.createProgressStream(id).pipe(
      (source) =>
        new Observable<MessageEvent>((subscriber) =>
          source.subscribe({
            next: (event) => {
              subscriber.next({
                data: documentProgressEventSchema.parse(event),
              });
            },
            error: (error: unknown) => subscriber.error(error),
            complete: () => subscriber.complete(),
          }),
        ),
    );
  }

  @Delete("documents/:id")
  @AuditLog("document.delete", AuditTargetType.DOCUMENT)
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.documentService.delete(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Post("documents/:id/archive")
  @AuditLog("document.archive", AuditTargetType.DOCUMENT)
  async archive(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.archive(id, this.requireUser(request));
    return { ok: true, data: documentSchema.parse(data) };
  }

  @Post("documents/:id/restore")
  @AuditLog("document.restore", AuditTargetType.DOCUMENT)
  async restore(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.restore(id, this.requireUser(request));
    return { ok: true, data: documentSchema.parse(data) };
  }

  @Post("documents/:id/reprocess")
  @AuditLog("document.reprocess", AuditTargetType.DOCUMENT)
  async reprocess(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<DocumentSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.documentService.reprocess(id, this.requireUser(request));
    return { ok: true, data: documentSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("已认证请求缺少用户信息");
    }

    return request.user;
  }

  private contentDisposition(disposition: "inline" | "attachment", filename: string): string {
    const fallback = this.asciiFilenameFallback(filename);
    const encodedFilename = this.encodeRfc5987Value(filename);
    return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodedFilename}`;
  }

  private asciiFilenameFallback(filename: string): string {
    const fallback = filename
      .replace(/[\r\n"\\]/g, "_")
      .replace(/[^\x20-\x7E]/g, "_")
      .trim();
    return fallback.length > 0 ? fallback.slice(0, 255) : "document";
  }

  private encodeRfc5987Value(value: string): string {
    return encodeURIComponent(value.replace(/[\r\n]/g, "_")).replace(
      /['()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  }
}
