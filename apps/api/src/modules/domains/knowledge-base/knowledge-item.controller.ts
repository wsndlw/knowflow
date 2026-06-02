import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  batchImportResponseSchema,
  createKnowledgeItemRequestSchema,
  knowledgeItemFeedbackRequestSchema,
  knowledgeItemListQuerySchema,
  knowledgeItemListResponseSchema,
  knowledgeItemSchema,
  updateKnowledgeItemRequestSchema,
  uuidParamSchema,
  type KnowledgeItem,
  type BatchImportResponse,
  type KnowledgeItemListResponse,
} from "@knowflow/shared";
import type {} from "multer";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import {
  detectBatchImportKind,
  MAX_BATCH_IMPORT_BYTES,
} from "../../../shared/upload/upload-file-validation.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
export class KnowledgeItemController {
  constructor(
    @Inject(KnowledgeItemService)
    private readonly knowledgeItemService: KnowledgeItemService,
  ) {}

  @Get("knowledge-bases/:id/knowledge-items")
  async listByKnowledgeBase(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItemListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeItemService.listByKnowledgeBase(
      id,
      knowledgeItemListQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: knowledgeItemListResponseSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/knowledge-items")
  async create(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const input = createKnowledgeItemRequestSchema.parse(body);
    const data = await this.knowledgeItemService.create(id, input, this.requireUser(request));
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/knowledge-items/batch-import")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: MAX_BATCH_IMPORT_BYTES },
      fileFilter: (_request, file, callback) => {
        if (detectBatchImportKind(file) !== null) {
          callback(null, true);
          return;
        }
        callback(
          new BadRequestException("Only CSV and XLSX files with matching MIME types are supported for batch import"),
          false,
        );
      },
    }),
  )
  async batchImport(
    @Param() params: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<BatchImportResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeItemService.batchImport(id, file, this.requireUser(request));
    return { ok: true, data: batchImportResponseSchema.parse(data) };
  }

  @Get("knowledge-items/:id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeItemService.get(id, this.requireUser(request));
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  @Patch("knowledge-items/:id")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateKnowledgeItemRequestSchema.parse(body);
    const data = await this.knowledgeItemService.update(id, input, this.requireUser(request));
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  @Post("knowledge-items/:id/publish")
  async publish(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeItemService.publish(id, this.requireUser(request));
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  @Post("knowledge-items/:id/unpublish")
  async unpublish(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeItemService.unpublish(id, this.requireUser(request));
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  @Delete("knowledge-items/:id")
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.knowledgeItemService.delete(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Post("knowledge-items/:id/feedback")
  async setFeedback(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeItem>> {
    const { id } = uuidParamSchema.parse(params);
    const input = knowledgeItemFeedbackRequestSchema.parse(body);
    const data = await this.knowledgeItemService.setFeedback(
      id,
      input,
      this.requireUser(request),
    );
    return { ok: true, data: knowledgeItemSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
