import { Queue } from "bullmq";

import { getRedisConnectionOptions } from "../../../shared/redis/redis-connection.js";

export const IMPROVEMENT_QUEUE_NAME = "knowledge-improvement";

export type ImprovementScanJob = {
  requestedAt: string;
};

export type ImprovementGenerateJob = {
  taskId: string;
};

export type ImprovementVerifyJob = {
  taskId: string;
};

export type ImprovementJob =
  | ImprovementScanJob
  | ImprovementGenerateJob
  | ImprovementVerifyJob;

export type ImprovementJobResult = {
  status: "completed" | "failed";
  created?: number;
  enqueued?: number;
  taskId?: string;
};

export type ImprovementJobName = "scan" | "generate" | "verify";

export function createImprovementQueue(): Queue<
  ImprovementJob,
  ImprovementJobResult,
  ImprovementJobName
> {
  return new Queue<ImprovementJob, ImprovementJobResult, ImprovementJobName>(
    IMPROVEMENT_QUEUE_NAME,
    {
      connection: getRedisConnectionOptions(),
    },
  );
}
