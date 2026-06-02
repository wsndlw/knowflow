import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  createTagRequestSchema,
  replaceTagsRequestSchema,
  tagListResponseSchema,
  tagSchema,
  updateTagRequestSchema,
  uuidParamSchema,
  type KnowledgeTag,
  type TagListResponse,
} from "@knowflow/shared";

import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { TagService } from "./tag.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
export class TagController {
  constructor(
    @Inject(TagService)
    private readonly tagService: TagService,
  ) {}

  @Get("knowledge-bases/:id/tags")
  async list(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<TagListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.tagService.list(id, this.requireUser(request));
    return { ok: true, data: tagListResponseSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/tags")
  @AuditLog("tag.create", AuditTargetType.TAG)
  async create(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeTag>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.tagService.create(
      id,
      createTagRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: tagSchema.parse(data) };
  }

  @Patch("tags/:id")
  @AuditLog("tag.update", AuditTargetType.TAG)
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<KnowledgeTag>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.tagService.update(
      id,
      updateTagRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: tagSchema.parse(data) };
  }

  @Delete("tags/:id")
  @AuditLog("tag.delete", AuditTargetType.TAG)
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.tagService.delete(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Put("documents/:id/tags")
  async replaceDocumentTags(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<TagListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.tagService.replaceDocumentTags(
      id,
      replaceTagsRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: tagListResponseSchema.parse(data) };
  }

  @Put("knowledge-items/:id/tags")
  async replaceKnowledgeItemTags(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<TagListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.tagService.replaceKnowledgeItemTags(
      id,
      replaceTagsRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: tagListResponseSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
