import {
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import {
  auditLogListQuerySchema,
  auditLogListResponseSchema,
  uuidParamSchema,
  type AuditLogListResponse,
} from "@knowflow/shared";

import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AuditLogQueryService } from "./audit-log-query.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

@Controller()
export class AuditLogController {
  constructor(
    @Inject(AuditLogQueryService)
    private readonly auditLogQueryService: AuditLogQueryService,
  ) {}

  @Get("knowledge-bases/:id/audit-logs")
  async list(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<AuditLogListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.auditLogQueryService.list(
      id,
      auditLogListQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: auditLogListResponseSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
