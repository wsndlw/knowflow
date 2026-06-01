import { Injectable } from "@nestjs/common";
import type { HealthResponse } from "@knowflow/shared";
import { sqlClient } from "@knowflow/db";
import Redis from "ioredis";

type DependencyHealth = HealthResponse["dependencies"]["database"];

@Injectable()
export class HealthService {
  async getHealth(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.checkRedis()]);
    const status = database.status === "ok" && redis.status === "ok" ? "ok" : "degraded";

    return {
      status,
      service: "api",
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        redis,
      },
    };
  }

  private async checkDatabase(): Promise<DependencyHealth> {
    const startedAt = Date.now();
    try {
      await sqlClient`select 1`;
      return { status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: "error",
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown database error",
      };
    }
  }

  private async checkRedis(): Promise<DependencyHealth> {
    const startedAt = Date.now();

    try {
      const redis = new Redis(process.env["REDIS_URL"] ?? "redis://localhost:6379", {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        connectTimeout: 2000,
      });
      redis.on("error", () => undefined);

      await redis.connect();
      await redis.ping();
      redis.disconnect();
      return { status: "ok", latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        status: "error",
        latencyMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown redis error",
      };
    }
  }
}
