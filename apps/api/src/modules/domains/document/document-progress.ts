import type { DocumentProgressEvent } from "@knowflow/shared";
import Redis from "ioredis";

const PROGRESS_CHANNEL_PREFIX = "document:progress";

export function getDocumentProgressChannel(documentId: string): string {
  return `${PROGRESS_CHANNEL_PREFIX}:${documentId}`;
}

export async function publishDocumentProgress(
  event: Omit<DocumentProgressEvent, "timestamp">,
): Promise<void> {
  const redis = createRedisClient();
  try {
    const payload: DocumentProgressEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };
    await redis.publish(getDocumentProgressChannel(event.documentId), JSON.stringify(payload));
  } finally {
    redis.disconnect();
  }
}

export function createRedisClient(): Redis {
  return new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
    enableReadyCheck: false,
    maxRetriesPerRequest: null,
  });
}
