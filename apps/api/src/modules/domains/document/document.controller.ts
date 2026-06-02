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
  Sse,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  documentListResponseSchema,
  documentListQuerySchema,
  documentProgressEventSchema,
  documentSchema,
  uuidParamSchema,
  type DocumentListResponse,
  type KnowledgeDocument,
} from "@knowflow/shared";
import type {} from "multer";
import { Observable } from "rxjs";

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

@Controller()
export class DocumentController {
  constructor(
    @Inject(DocumentService)
    private readonly documentService: DocumentService,
  ) {}

  @Post("knowledge-bases/:id/documents")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_DOCUMENT_UPLOAD_BYTES },
      fileFilter: (_request, file, callback) => {
        if (detectDocumentUploadKind(file) !== null) {
          callback(null, true);
          return;
        }
        callback(
          new BadRequestException("Only PDF, Markdown, TXT, DOCX, CSV, XLSX, XLS, and image files with matching MIME types are supported"),
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

  @Sse("documents/:id/progress")
  async progress(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<Observable<MessageEvent>> {
    const { id } = uuidParamSchema.parse(params);
    await this.documentService.get(id, this.requireUser(request));
    return this.documentService.createProgressStream(id).pipe((source) =>
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
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.documentService.delete(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Post("documents/:id/reprocess")
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
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
