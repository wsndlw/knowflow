import { Module } from "@nestjs/common";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { RetrievalService } from "./retrieval.service.js";

@Module({
  providers: [AliyunLlmService, RetrievalService],
  exports: [RetrievalService],
})
export class RetrievalModule {}
