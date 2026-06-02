import {
  Body,
  Controller,
  Inject,
  InternalServerErrorException,
  Post,
  Req,
} from "@nestjs/common";
import { analyticsEventRequestSchema } from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AnalyticsEventService } from "./analytics-event.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

@Controller("analytics")
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsEventService)
    private readonly analyticsEventService: AnalyticsEventService,
  ) {}

  @Post("events")
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
