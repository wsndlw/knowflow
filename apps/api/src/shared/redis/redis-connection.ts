import type { ConnectionOptions } from "bullmq";

export function getRedisConnectionOptions(): ConnectionOptions {
  const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";
  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}
