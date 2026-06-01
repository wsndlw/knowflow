import { Module } from "@nestjs/common";

import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";

@Module({
  providers: [KnowledgeBaseAccessService],
  exports: [KnowledgeBaseAccessService],
})
export class KnowledgeBaseModule {}
