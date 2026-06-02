import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { AuditLogController } from "./audit-log.controller.js";
import { AuditLogQueryService } from "./audit-log-query.service.js";
import { KnowledgeItemController } from "./knowledge-item.controller.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";
import { KnowledgeImprovementController } from "./knowledge-improvement.controller.js";
import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseController } from "./knowledge-base.controller.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";
import { MindMapController } from "./mind-map.controller.js";
import { MindMapService } from "./mind-map.service.js";
import { TagController } from "./tag.controller.js";
import { TagService } from "./tag.service.js";

@Module({
  controllers: [
    KnowledgeBaseController,
    KnowledgeItemController,
    KnowledgeImprovementController,
    TagController,
    AuditLogController,
    MindMapController,
  ],
  providers: [
    AliyunLlmService,
    KnowledgeBaseAccessService,
    KnowledgeBaseService,
    KnowledgeItemService,
    KnowledgeImprovementService,
    TagService,
    AuditLogQueryService,
    MindMapService,
  ],
  exports: [KnowledgeBaseAccessService, KnowledgeImprovementService],
})
export class KnowledgeBaseModule {}
