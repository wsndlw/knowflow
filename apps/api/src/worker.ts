import "reflect-metadata";
import { Worker } from "bullmq";

import {
  DOCUMENT_QUEUE_NAME,
  type DocumentJobName,
  type DocumentSmokeJob,
  type DocumentSmokeResult,
} from "./modules/domains/document/document-queue.js";
import { getRedisConnectionOptions } from "./shared/redis/redis-connection.js";

const worker = new Worker<DocumentSmokeJob, DocumentSmokeResult, DocumentJobName>(
  DOCUMENT_QUEUE_NAME,
  (job) => {
    return Promise.resolve({
      consumedAt: new Date().toISOString(),
      requestedAt: job.data.requestedAt,
    });
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
