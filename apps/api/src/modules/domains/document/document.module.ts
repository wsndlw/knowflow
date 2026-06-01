import { Module } from "@nestjs/common";

import { KnowledgeBaseModule } from "../knowledge-base/knowledge-base.module.js";
import { DocumentController } from "./document.controller.js";
import { DocumentService } from "./document.service.js";

@Module({
  imports: [KnowledgeBaseModule],
  controllers: [DocumentController],
  providers: [DocumentService],
  exports: [DocumentService],
})
export class DocumentModule {}
