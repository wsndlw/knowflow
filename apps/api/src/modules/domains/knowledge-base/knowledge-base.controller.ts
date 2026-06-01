import {
  Body,
  Controller,
  Delete,
  Get,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  createKnowledgeBaseRequestSchema,
  knowledgeBaseListQuerySchema,
  updateKnowledgeBaseRequestSchema,
  uuidParamSchema,
  type KnowledgeBase,
  type KnowledgeBaseListResponse,
} from "@knowflow/shared";

import { Roles } from "../../../shared/decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

type KnowledgeBaseSuccess = {
  ok: true;
  data: KnowledgeBase;
};

type KnowledgeBaseListSuccess = {
  ok: true;
  data: KnowledgeBaseListResponse;
};

@Controller("knowledge-bases")
export class KnowledgeBaseController {
  constructor(private readonly knowledgeBaseService: KnowledgeBaseService) {}

  @Get()
  async list(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseListSuccess> {
    return {
      ok: true,
      data: await this.knowledgeBaseService.list(
        knowledgeBaseListQuerySchema.parse(query),
        this.requireUser(request),
      ),
    };
  }

  @Post()
  @Roles("super_admin", "department_admin")
  async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    return {
      ok: true,
      data: await this.knowledgeBaseService.create(
        createKnowledgeBaseRequestSchema.parse(body),
        this.requireUser(request),
      ),
    };
  }

  @Get(":id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.get(id, this.requireUser(request)),
    };
  }

  @Patch(":id")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.update(
        id,
        updateKnowledgeBaseRequestSchema.parse(body),
        this.requireUser(request),
      ),
    };
  }

  @Delete(":id")
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.knowledgeBaseService.delete(id, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
