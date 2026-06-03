import { Injectable } from "@nestjs/common";
import {
  agentKnowledgeBases,
  auditLogs,
  db,
  documents,
  knowledgeItems,
  tags,
} from "@knowflow/db";
import type { AuditResult, AuditTargetTypeValue } from "@knowflow/shared";
import { AuditTargetType } from "@knowflow/shared";
import { eq } from "drizzle-orm";

@Injectable()
export class AuditLogService {
  async record(input: {
    userId: string | null;
    action: string;
    knowledgeBaseId: string | null;
    targetType: AuditTargetTypeValue;
    targetId: string | null;
    result: AuditResult;
    detail: Record<string, unknown>;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await db.insert(auditLogs).values({
      userId: input.userId,
      knowledgeBaseId:
        input.knowledgeBaseId ??
        (await this.resolveKnowledgeBaseId(input.targetType, input.targetId)),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      result: input.result,
      detail: input.detail,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }

  async resolveKnowledgeBaseId(
    targetType: AuditTargetTypeValue,
    targetId: string | null,
  ): Promise<string | null> {
    if (targetId === null) {
      return null;
    }
    if (
      targetType === AuditTargetType.KNOWLEDGE_BASE ||
      targetType === AuditTargetType.RETRIEVAL_SETTINGS ||
      targetType === AuditTargetType.MIND_MAP
    ) {
      return targetId;
    }
    if (targetType === AuditTargetType.DOCUMENT) {
      const [row] = await db
        .select({ knowledgeBaseId: documents.knowledgeBaseId })
        .from(documents)
        .where(eq(documents.id, targetId))
        .limit(1);
      return row?.knowledgeBaseId ?? null;
    }
    if (targetType === AuditTargetType.KNOWLEDGE_ITEM) {
      const [row] = await db
        .select({ knowledgeBaseId: knowledgeItems.knowledgeBaseId })
        .from(knowledgeItems)
        .where(eq(knowledgeItems.id, targetId))
        .limit(1);
      return row?.knowledgeBaseId ?? null;
    }
    if (targetType === AuditTargetType.TAG) {
      const [row] = await db
        .select({ knowledgeBaseId: tags.knowledgeBaseId })
        .from(tags)
        .where(eq(tags.id, targetId))
        .limit(1);
      return row?.knowledgeBaseId ?? null;
    }
    if (targetType === AuditTargetType.AGENT) {
      const [row] = await db
        .select({ knowledgeBaseId: agentKnowledgeBases.knowledgeBaseId })
        .from(agentKnowledgeBases)
        .where(eq(agentKnowledgeBases.agentId, targetId))
        .limit(1);
      return row?.knowledgeBaseId ?? null;
    }
    return null;
  }
}
