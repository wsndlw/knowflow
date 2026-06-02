import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module.js";
import { RetrievalController } from "./retrieval.controller.js";
import { RetrievalSettingsController } from "./retrieval-settings.controller.js";
import { RetrievalSettingsService } from "./retrieval-settings.service.js";
import { RetrievalService } from "./retrieval.service.js";

@Module({
  imports: [KnowledgeBaseModule],
  controllers: [RetrievalController, RetrievalSettingsController],
  providers: [AliyunLlmService, RetrievalService, RetrievalSettingsService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
