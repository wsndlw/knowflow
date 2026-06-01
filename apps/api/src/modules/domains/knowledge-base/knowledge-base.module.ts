import { Module } from "@nestjs/common";

import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseController } from "./knowledge-base.controller.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

@Module({
  controllers: [KnowledgeBaseController],
  providers: [KnowledgeBaseAccessService, KnowledgeBaseService],
  exports: [KnowledgeBaseAccessService],
})
export class KnowledgeBaseModule {}
