import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { KnowledgeItemController } from "./knowledge-item.controller.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";
import { KnowledgeImprovementController } from "./knowledge-improvement.controller.js";
import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseController } from "./knowledge-base.controller.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

@Module({
  controllers: [
    KnowledgeBaseController,
    KnowledgeItemController,
    KnowledgeImprovementController,
  ],
  providers: [
    AliyunLlmService,
    KnowledgeBaseAccessService,
    KnowledgeBaseService,
    KnowledgeItemService,
    KnowledgeImprovementService,
  ],
  exports: [KnowledgeBaseAccessService, KnowledgeImprovementService],
})
export class KnowledgeBaseModule {}
