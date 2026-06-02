import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { KnowledgeItemController } from "./knowledge-item.controller.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";
import { KnowledgeImprovementController } from "./knowledge-improvement.controller.js";
import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseController } from "./knowledge-base.controller.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { TagController } from "./tag.controller.js";
import { TagService } from "./tag.service.js";

@Module({
  controllers: [
    KnowledgeBaseController,
    KnowledgeItemController,
    KnowledgeImprovementController,
    TagController,
  ],
  providers: [
    AliyunLlmService,
    KnowledgeBaseAccessService,
    KnowledgeBaseService,
    KnowledgeItemService,
    KnowledgeImprovementService,
    TagService,
  ],
  exports: [KnowledgeBaseAccessService, KnowledgeImprovementService],
})
export class KnowledgeBaseModule {}
