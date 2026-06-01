import { Module } from "@nestjs/common";

import { AgentModule } from "./domains/agent/agent.module.js";
import { AuthModule } from "./domains/auth/auth.module.js";
import { DocumentModule } from "./domains/document/document.module.js";
import { HealthModule } from "./domains/health/health.module.js";
import { KnowledgeBaseModule } from "./domains/knowledge-base/knowledge-base.module.js";
import { ModelModule } from "./domains/model/model.module.js";
import { RetrievalModule } from "./domains/retrieval/retrieval.module.js";

@Module({
  imports: [
    HealthModule,
    AuthModule,
    KnowledgeBaseModule,
    DocumentModule,
    AgentModule,
    RetrievalModule,
    ModelModule,
  ],
})
export class AppModule {}
