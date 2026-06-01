import { QueueEvents } from "bullmq";

import {
  createDocumentQueue,
  DOCUMENT_QUEUE_NAME,
  type DocumentSmokeResult,
} from "../modules/domains/document/document-queue.js";
import { getRedisConnectionOptions } from "../shared/redis/redis-connection.js";

async function run(): Promise<void> {
  const queue = createDocumentQueue();
  const events = new QueueEvents(DOCUMENT_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });

  await events.waitUntilReady();
  const job = await queue.add("smoke", {
    requestedAt: new Date().toISOString(),
  });

  const result: DocumentSmokeResult = await job.waitUntilFinished(events, 10000);
  console.log(JSON.stringify({ jobId: job.id, result }, null, 2));

  await events.close();
  await queue.close();
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
