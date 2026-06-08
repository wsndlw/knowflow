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
  analyticsEventRequestSchema,
  analyticsOverviewResponseSchema,
  analyticsRangeQuerySchema,
  knowledgeBaseAnalyticsResponseSchema,
  uuidParamSchema,
  type AnalyticsOverviewResponse,
  type KnowledgeBaseAnalyticsResponse,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AnalyticsService } from "./analytics.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

@Controller()
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService)
    private readonly analyticsService: AnalyticsService,
  ) {}

  @Get("knowledge-bases/:id/analytics")
  async getKnowledgeBaseAnalytics(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: true; data: KnowledgeBaseAnalyticsResponse }> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.analyticsService.getKnowledgeBaseAnalytics(
      id,
      analyticsRangeQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: knowledgeBaseAnalyticsResponseSchema.parse(data) };
  }

  @Get("analytics/overview")
  async getOverview(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ ok: true; data: AnalyticsOverviewResponse }> {
    const data = await this.analyticsService.getOverview(
      analyticsRangeQuerySchema.parse(query),
      this.requireUser(request),
    );
    return { ok: true, data: analyticsOverviewResponseSchema.parse(data) };
  }

  @Post("analytics/events")
  async recordEvent(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const input = analyticsEventRequestSchema.parse(body);
    await this.analyticsService.recordUserReportedEvent(this.requireUser(request), input);
    return { ok: true, data: {} };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("已认证请求缺少用户信息");
    }

    return request.user;
  }
}
