import "reflect-metadata";
import "./shared/config/load-env.js";
import { Worker } from "bullmq";
import { requireModelApiKeyEncryptionKey } from "@knowflow/db";

import {
  DOCUMENT_QUEUE_NAME,
  type DocumentProcessJob,
  type DocumentQueueJob,
  type DocumentQueueResult,
  type DocumentJobName,
  type DocumentSmokeJob,
} from "./modules/domains/document/document-queue.js";
import { processDocument } from "./modules/domains/document/document-processor.js";
import { getRedisConnectionOptions } from "./shared/redis/redis-connection.js";

requireModelApiKeyEncryptionKey();

const worker = new Worker<DocumentQueueJob, DocumentQueueResult, DocumentJobName>(
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

worker.on("completed", (job) => {
  console.log(`completed ${job.queueName}/${job.name}/${job.id ?? "unknown"}`);
});

worker.on("failed", (job, error) => {
  console.error(`failed ${job?.queueName ?? DOCUMENT_QUEUE_NAME}/${job?.id ?? "unknown"}`, error);
});

process.on("SIGTERM", () => {
  void worker.close().then(() => process.exit(0));
});

process.on("SIGINT", () => {
  void worker.close().then(() => process.exit(0));
});
