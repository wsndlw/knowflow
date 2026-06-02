import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  generateMindMapResponseSchema,
  mindMapResponseSchema,
  saveMindMapRequestSchema,
  uuidParamSchema,
  type GenerateMindMapResponse,
  type MindMapResponse,
} from "@knowflow/shared";

import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { MindMapService } from "./mind-map.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

@Controller()
export class MindMapController {
  constructor(
    @Inject(MindMapService)
    private readonly mindMapService: MindMapService,
  ) {}

  @Get("knowledge-bases/:id/mind-map")
  async getPublished(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<MindMapResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.mindMapService.getPublished(id, this.requireUser(request));
    return { ok: true, data: mindMapResponseSchema.parse(data) };
  }

  @Get("knowledge-bases/:id/mind-map/draft")
  async getDraft(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<MindMapResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.mindMapService.getDraft(id, this.requireUser(request));
    return { ok: true, data: mindMapResponseSchema.parse(data) };
  }

  @Put("knowledge-bases/:id/mind-map")
  @AuditLog("mind_map.save", AuditTargetType.MIND_MAP)
  async save(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<MindMapResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.mindMapService.save(
      id,
      saveMindMapRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: mindMapResponseSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/mind-map/publish")
  @AuditLog("mind_map.publish", AuditTargetType.MIND_MAP)
  async publish(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<MindMapResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.mindMapService.publish(id, this.requireUser(request));
    return { ok: true, data: mindMapResponseSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/mind-map/generate")
  @AuditLog("mind_map.generate", AuditTargetType.MIND_MAP)
  async generate(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<GenerateMindMapResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.mindMapService.generate(id, this.requireUser(request));
    return { ok: true, data: generateMindMapResponseSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
