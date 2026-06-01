import { Queue } from "bullmq";

import { getRedisConnectionOptions } from "../../../shared/redis/redis-connection.js";

export const DOCUMENT_QUEUE_NAME = "document-processing";

export type DocumentSmokeJob = {
  requestedAt: string;
};

export type DocumentSmokeResult = {
  consumedAt: string;
  requestedAt: string;
};

export type DocumentProcessJob = {
  documentId: string;
};

export type DocumentProcessResult = {
  documentId: string;
  status: "completed" | "failed";
};

export type DocumentQueueJob = DocumentSmokeJob | DocumentProcessJob;

export type DocumentQueueResult = DocumentSmokeResult | DocumentProcessResult;

export type DocumentJobName = "smoke" | "process";

export function createDocumentQueue(): Queue<
  DocumentQueueJob,
  DocumentQueueResult,
  DocumentJobName
> {
  return new Queue<DocumentQueueJob, DocumentQueueResult, DocumentJobName>(DOCUMENT_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });
}
