import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { KnowledgeItemController } from "./knowledge-item.controller.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseController } from "./knowledge-base.controller.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

@Module({
  controllers: [KnowledgeBaseController, KnowledgeItemController],
  providers: [AliyunLlmService, KnowledgeBaseAccessService, KnowledgeBaseService, KnowledgeItemService],
  exports: [KnowledgeBaseAccessService],
})
export class KnowledgeBaseModule {}
