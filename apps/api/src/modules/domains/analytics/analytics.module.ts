import { Global, Module } from "@nestjs/common";

import { AnalyticsEventService } from "./analytics-event.service.js";

@Global()
@Module({
  providers: [AnalyticsEventService],
  exports: [AnalyticsEventService],
})
export class AnalyticsModule {}
