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
  analyticsRangeQuerySchema,
  knowledgeBaseAnalyticsResponseSchema,
  uuidParamSchema,
  type KnowledgeBaseAnalyticsResponse,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AnalyticsEventService } from "./analytics-event.service.js";
import { AnalyticsService } from "./analytics.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

@Controller()
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsEventService)
    private readonly analyticsEventService: AnalyticsEventService,
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

  @Post("analytics/events")
  async recordEvent(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const input = analyticsEventRequestSchema.parse(body);
    await this.analyticsEventService.recordUserReportedEvent(this.requireUser(request), input);
    return { ok: true, data: {} };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
