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

export type DocumentJobName = "smoke";

export function createDocumentQueue(): Queue<
  DocumentSmokeJob,
  DocumentSmokeResult,
  DocumentJobName
> {
  return new Queue<DocumentSmokeJob, DocumentSmokeResult, DocumentJobName>(DOCUMENT_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });
}
