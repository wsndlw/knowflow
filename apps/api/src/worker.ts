import "reflect-metadata";
import "./shared/config/load-env.js";
import { Worker } from "bullmq";
import { requireModelApiKeyEncryptionKey } from "@knowflow/db";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./modules/app.module.js";
import { AliyunLlmService } from "./shared/llm/aliyun-llm.js";
import {
  CONVERSATION_SUMMARY_QUEUE_NAME,
  type ConversationSummaryJob,
  type ConversationSummaryJobName,
  type ConversationSummaryJobResult,
} from "./modules/domains/agent/conversation-summary-queue.js";
import { processConversationSummary } from "./modules/domains/agent/conversation-summary-processor.js";
import {
  DOCUMENT_QUEUE_NAME,
  type DocumentProcessJob,
  type DocumentQueueJob,
  type DocumentQueueResult,
  type DocumentJobName,
  type DocumentSmokeJob,
} from "./modules/domains/document/document-queue.js";
import { processDocument } from "./modules/domains/document/document-processor.js";
import { KnowledgeImprovementService } from "./modules/domains/knowledge-base/knowledge-improvement.service.js";
import {
  createImprovementQueue,
  IMPROVEMENT_QUEUE_NAME,
  type ImprovementDocumentExtractionJob,
  type ImprovementGenerateJob,
  type ImprovementJob,
  type ImprovementJobName,
  type ImprovementJobResult,
  type ImprovementVerifyJob,
} from "./modules/domains/knowledge-base/knowledge-improvement-queue.js";
import {
  processImprovementDocumentExtraction,
  processImprovementGenerate,
  processImprovementScan,
  processImprovementVerify,
} from "./modules/domains/knowledge-base/knowledge-improvement-processor.js";
import { getRedisConnectionOptions } from "./shared/redis/redis-connection.js";

requireModelApiKeyEncryptionKey();

const app = await NestFactory.createApplicationContext(AppModule);
const llm = app.get(AliyunLlmService);
const improvementService = app.get(KnowledgeImprovementService);

const documentWorker = new Worker<DocumentQueueJob, DocumentQueueResult, DocumentJobName>(
  DOCUMENT_QUEUE_NAME,
  (job) => {
    if (job.name === "smoke") {
      const data = job.data as DocumentSmokeJob;
      return Promise.resolve({
        consumedAt: new Date().toISOString(),
        requestedAt: data.requestedAt,
      });
    }

    const data = job.data as DocumentProcessJob;
    return processDocument(data.documentId);
  },
  {
    connection: getRedisConnectionOptions(),
  },
);

const improvementQueue = createImprovementQueue();
await improvementQueue.add(
  "scan",
  { requestedAt: new Date().toISOString() },
  {
    repeat: { pattern: "0 * * * *" },
    jobId: "knowledge-improvement-scan-hourly",
    removeOnComplete: { count: 24 },
    removeOnFail: { count: 24 },
  },
);
await improvementQueue.close();

const improvementWorker = new Worker<ImprovementJob, ImprovementJobResult, ImprovementJobName>(
  IMPROVEMENT_QUEUE_NAME,
  (job) => {
    if (job.name === "scan") {
      return processImprovementScan(improvementService);
    }
    if (job.name === "generate") {
      const data = job.data as ImprovementGenerateJob;
      return processImprovementGenerate(improvementService, data.taskId);
    }
    if (job.name === "document_extraction") {
      const data = job.data as ImprovementDocumentExtractionJob;
      return processImprovementDocumentExtraction(improvementService, data.documentId);
    }
    const data = job.data as ImprovementVerifyJob;
    return processImprovementVerify(improvementService, data.taskId);
  },
  {
    connection: getRedisConnectionOptions(),
  },
);

const conversationSummaryWorker = new Worker<
  ConversationSummaryJob,
  ConversationSummaryJobResult,
  ConversationSummaryJobName
>(
  CONVERSATION_SUMMARY_QUEUE_NAME,
  (job) => processConversationSummary(llm, job.data.conversationId),
  {
    connection: getRedisConnectionOptions(),
  },
);

documentWorker.on("completed", (job) => {
  console.log(`completed ${job.queueName}/${job.name}/${job.id ?? "unknown"}`);
});

documentWorker.on("failed", (job, error) => {
  console.error(`failed ${job?.queueName ?? DOCUMENT_QUEUE_NAME}/${job?.id ?? "unknown"}`, error);
});

improvementWorker.on("completed", (job) => {
  console.log(`completed ${job.queueName}/${job.name}/${job.id ?? "unknown"}`);
});

improvementWorker.on("failed", (job, error) => {
  console.error(`failed ${job?.queueName ?? IMPROVEMENT_QUEUE_NAME}/${job?.id ?? "unknown"}`, error);
});

conversationSummaryWorker.on("completed", (job) => {
  console.log(`completed ${job.queueName}/${job.name}/${job.id ?? "unknown"}`);
});

conversationSummaryWorker.on("failed", (job, error) => {
  console.error(
    `failed ${job?.queueName ?? CONVERSATION_SUMMARY_QUEUE_NAME}/${job?.id ?? "unknown"}`,
    error,
  );
});

process.on("SIGTERM", () => {
  void Promise.all([
    documentWorker.close(),
    improvementWorker.close(),
    conversationSummaryWorker.close(),
    app.close(),
  ]).then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void Promise.all([
    documentWorker.close(),
    improvementWorker.close(),
    conversationSummaryWorker.close(),
    app.close(),
  ]).then(() => process.exit(0));
});
