import { Global, Module } from "@nestjs/common";

import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsEventService } from "./analytics-event.service.js";
import { AnalyticsService } from "./analytics.service.js";

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsEventService, AnalyticsService],
  exports: [AnalyticsEventService],
})
export class AnalyticsModule {}
