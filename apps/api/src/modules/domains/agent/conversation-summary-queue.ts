import { Queue, type JobsOptions } from "bullmq";

import { getRedisConnectionOptions } from "../../../shared/redis/redis-connection.js";

export const CONVERSATION_SUMMARY_QUEUE_NAME = "conversation-summary";
export const CONVERSATION_SUMMARY_JOB_NAME = "summarize";

export type ConversationSummaryJob = {
  conversationId: string;
};

export type ConversationSummaryJobResult = {
  conversationId: string;
  status: "completed" | "skipped";
  summarizedMessageCount?: number;
};

export type ConversationSummaryJobName = typeof CONVERSATION_SUMMARY_JOB_NAME;

export function buildConversationSummaryJobId(conversationId: string): string {
  return `conversation-summarize-${conversationId}`;
}

export function buildConversationSummaryJobOptions(conversationId: string): JobsOptions {
  return {
    jobId: buildConversationSummaryJobId(conversationId),
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { count: 1000 },
  };
}

export function createConversationSummaryQueue(): Queue<
  ConversationSummaryJob,
  ConversationSummaryJobResult,
  ConversationSummaryJobName
> {
  return new Queue<
    ConversationSummaryJob,
    ConversationSummaryJobResult,
    ConversationSummaryJobName
  >(CONVERSATION_SUMMARY_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
  });
}
