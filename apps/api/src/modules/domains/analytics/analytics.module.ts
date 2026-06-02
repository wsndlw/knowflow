import { Global, Module } from "@nestjs/common";

import { AnalyticsController } from "./analytics.controller.js";
import { AnalyticsEventService } from "./analytics-event.service.js";

@Global()
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsEventService],
  exports: [AnalyticsEventService],
})
export class AnalyticsModule {}
