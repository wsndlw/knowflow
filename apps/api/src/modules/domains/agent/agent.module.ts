import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module.js";
import { RetrievalModule } from "../retrieval/retrieval.module.js";
import { AgentManagementController } from "./agent-management.controller.js";
import { AgentManagementService } from "./agent-management.service.js";
import { AgentController } from "./agent.controller.js";
import { AgentService } from "./agent.service.js";

@Module({
  imports: [KnowledgeBaseModule, RetrievalModule],
  controllers: [AgentController, AgentManagementController],
  providers: [AliyunLlmService, AgentService, AgentManagementService],
})
export class AgentModule {}
