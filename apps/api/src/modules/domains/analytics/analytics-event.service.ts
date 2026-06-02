import { Injectable } from "@nestjs/common";
import { analyticsEvents, db } from "@knowflow/db";
import type {
  AnalyticsEvent,
  AnalyticsEventRequest,
  AnalyticsEventType,
  AnalyticsTargetType,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";

export type RecordAnalyticsEventInput = {
  user: AuthenticatedUser;
  eventType: AnalyticsEventType;
  targetType?: AnalyticsTargetType;
  targetId?: string;
  knowledgeBaseId?: string | null;
  sessionId?: string;
  agentId?: string | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class AnalyticsEventService {
  async record(input: RecordAnalyticsEventInput): Promise<AnalyticsEvent> {
    const [created] = await db
      .insert(analyticsEvents)
      .values({
        userId: input.user.id,
        eventType: input.eventType,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        knowledgeBaseId: input.knowledgeBaseId ?? null,
        sessionId: input.sessionId ?? null,
        agentId: input.agentId ?? null,
        durationMs: input.durationMs ?? null,
        metadata: input.metadata ?? {},
      })
      .returning();

    if (created === undefined) {
      throw new Error("Failed to record analytics event");
    }

    return {
      id: created.id,
      eventType: created.eventType,
      targetType: created.targetType,
      targetId: created.targetId,
      knowledgeBaseId: created.knowledgeBaseId,
      sessionId: created.sessionId,
      agentId: created.agentId,
      durationMs: created.durationMs,
      metadata:
        created.metadata !== null &&
        typeof created.metadata === "object" &&
        !Array.isArray(created.metadata)
          ? (created.metadata as Record<string, unknown>)
          : {},
      createdDate: created.createdDate,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async recordSafe(input: RecordAnalyticsEventInput): Promise<void> {
    try {
      await this.record(input);
    } catch {
      // Analytics is a side channel and must never affect business flows.
    }
  }

  async recordUserReportedEvent(
    user: AuthenticatedUser,
    input: AnalyticsEventRequest,
  ): Promise<void> {
    await this.recordSafe({
      user,
      eventType: input.eventType,
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      ...(input.knowledgeBaseId !== undefined ? { knowledgeBaseId: input.knowledgeBaseId } : {}),
      ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
      ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
    });
  }
}
