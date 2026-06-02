import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Put,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  retrievalSettingsSchema,
  updateRetrievalSettingsRequestSchema,
  uuidParamSchema,
  type RetrievalSettings,
} from "@knowflow/shared";

import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { RetrievalSettingsService } from "./retrieval-settings.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

@Controller()
export class RetrievalSettingsController {
  constructor(
    @Inject(RetrievalSettingsService)
    private readonly retrievalSettingsService: RetrievalSettingsService,
  ) {}

  @Get("knowledge-bases/:id/retrieval-settings")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<RetrievalSettings>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.retrievalSettingsService.get(id, this.requireUser(request));
    return { ok: true, data: retrievalSettingsSchema.parse(data) };
  }

  @Put("knowledge-bases/:id/retrieval-settings")
  @AuditLog("retrieval_settings.update", AuditTargetType.RETRIEVAL_SETTINGS)
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<RetrievalSettings>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.retrievalSettingsService.update(
      id,
      updateRetrievalSettingsRequestSchema.parse(body),
      this.requireUser(request),
    );
    return { ok: true, data: retrievalSettingsSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
