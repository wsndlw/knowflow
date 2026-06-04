import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";

import { AgentModule } from "./domains/agent/agent.module.js";
import { AnalyticsModule } from "./domains/analytics/analytics.module.js";
import { AuthModule } from "./domains/auth/auth.module.js";
import { DepartmentModule } from "./domains/department/department.module.js";
import { DocumentModule } from "./domains/document/document.module.js";
import { HealthModule } from "./domains/health/health.module.js";
import { KnowledgeBaseModule } from "./domains/knowledge-base/knowledge-base.module.js";
import { ModelModule } from "./domains/model/model.module.js";
import { RetrievalModule } from "./domains/retrieval/retrieval.module.js";
import { AuditLogInterceptor } from "../shared/audit/audit-log.interceptor.js";
import { AuditLogService } from "../shared/audit/audit-log.service.js";

@Module({
  imports: [
    AnalyticsModule,
    HealthModule,
    AuthModule,
    DepartmentModule,
    KnowledgeBaseModule,
    DocumentModule,
    AgentModule,
    RetrievalModule,
    ModelModule,
  ],
  providers: [
    AuditLogService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
  ],
})
export class AppModule {}
