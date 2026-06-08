import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  approveImprovementTaskRequestSchema,
  approveImprovementTaskResponseSchema,
  createImprovementTasksResponseSchema,
  generateImprovementTasksRequestSchema,
  improvementTaskListQuerySchema,
  improvementTaskListResponseSchema,
  improvementTaskSchema,
  improvementTaskStatsSchema,
  rejectImprovementTaskRequestSchema,
  uuidParamSchema,
  type ApproveImprovementTaskResponse,
  type CreateImprovementTasksResponse,
  type ImprovementTask,
  type ImprovementTaskListResponse,
  type ImprovementTaskStats,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

@Controller()
export class KnowledgeImprovementController {
  constructor(
    @Inject(KnowledgeImprovementService)
    private readonly improvementService: KnowledgeImprovementService,
  ) {}

  @Get("knowledge-bases/:id/improvement-tasks")
  async list(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ImprovementTaskListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.improvementService.list(
      id,
      improvementTaskListQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: improvementTaskListResponseSchema.parse(data) };
  }

  @Get("knowledge-bases/:id/improvement-tasks/stats")
  async stats(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ImprovementTaskStats>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.improvementService.stats(id, this.requireUser(request));
    return { ok: true, data: improvementTaskStatsSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/improvement-tasks/generate")
  async generate(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<CreateImprovementTasksResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const input = generateImprovementTasksRequestSchema.parse(body ?? {});
    const data = await this.improvementService.generate(
      id,
      {
        ...(input.messageId === undefined ? {} : { messageId: input.messageId }),
        ...(input.documentId === undefined ? {} : { documentId: input.documentId }),
      },
      this.requireUser(request),
    );
    return { ok: true, data: createImprovementTasksResponseSchema.parse(data) };
  }

  @Get("improvement-tasks/:id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ImprovementTask>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.improvementService.get(id, this.requireUser(request));
    return { ok: true, data: improvementTaskSchema.parse(data) };
  }

  @Post("improvement-tasks/:id/approve")
  async approve(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ApproveImprovementTaskResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.improvementService.approve(
      id,
      approveImprovementTaskRequestSchema.parse(body ?? {}),
      this.requireUser(request),
    );
    return { ok: true, data: approveImprovementTaskResponseSchema.parse(data) };
  }

  @Post("improvement-tasks/:id/reject")
  async reject(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ImprovementTask>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.improvementService.reject(
      id,
      rejectImprovementTaskRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: improvementTaskSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("已认证请求缺少用户信息");
    }

    return request.user;
  }
}
