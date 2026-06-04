import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import {
  agentKnowledgeBases,
  agents,
  auditLogs,
  db,
  documents,
  knowledgeItems,
  tags,
  users,
} from "@knowflow/db";
import {
  ACTION_LABELS,
  AUDIT_TARGET_TYPES,
  AuditTargetType,
  type AuditLogEntry,
  type AuditLogListQuery,
  type AuditLogListResponse,
} from "@knowflow/shared";
import {
  and,
  count,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";

type AuditLogRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  result: string;
  detail: unknown;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
};

@Injectable()
export class AuditLogQueryService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
  ) {}

  async list(
    knowledgeBaseId: string,
    query: AuditLogListQuery,
    user: AuthenticatedUser,
  ): Promise<AuditLogListResponse> {
    await this.ensureCanManage(knowledgeBaseId, user);

    const condition = this.buildCondition(knowledgeBaseId, query);
    const offset = (query.page - 1) * query.pageSize;
    const [[{ value: total } = { value: 0 }], rows] = await Promise.all([
      db.select({ value: count() }).from(auditLogs).where(condition),
      db
        .select({
          id: auditLogs.id,
          userId: auditLogs.userId,
          userName: users.name,
          action: auditLogs.action,
          targetType: auditLogs.targetType,
          targetId: auditLogs.targetId,
          result: auditLogs.result,
          detail: auditLogs.detail,
          ip: auditLogs.ip,
          userAgent: auditLogs.userAgent,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.userId))
        .where(condition)
        .orderBy(desc(auditLogs.createdAt))
        .limit(query.pageSize)
        .offset(offset),
    ]);

    const labels = await this.fetchTargetLabels(rows);
    return {
      items: rows.map((row) => this.toEntry(row, labels)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  private buildCondition(knowledgeBaseId: string, query: AuditLogListQuery): SQL {
    const conditions: SQL[] = [this.buildKnowledgeBaseTargetCondition(knowledgeBaseId)];
    if (query.action !== undefined && query.action.length > 0) {
      conditions.push(inArray(auditLogs.action, query.action));
    }
    if (query.targetType !== undefined && query.targetType.length > 0) {
      conditions.push(inArray(auditLogs.targetType, query.targetType));
    }
    if (query.userId !== undefined) {
      conditions.push(eq(auditLogs.userId, query.userId));
    }
    if (query.result !== undefined) {
      conditions.push(eq(auditLogs.result, query.result));
    }
    if (query.from !== undefined) {
      conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
    }
    if (query.to !== undefined) {
      conditions.push(lte(auditLogs.createdAt, new Date(query.to)));
    }
    const condition = and(...conditions);
    if (condition === undefined) {
      throw new Error("Failed to build audit log condition");
    }
    return condition;
  }

  private buildKnowledgeBaseTargetCondition(knowledgeBaseId: string): SQL {
    const legacyCondition = or(
      and(eq(auditLogs.targetType, "knowledge_base"), eq(auditLogs.targetId, knowledgeBaseId)),
      and(eq(auditLogs.targetType, "retrieval_settings"), eq(auditLogs.targetId, knowledgeBaseId)),
      and(eq(auditLogs.targetType, "mind_map"), eq(auditLogs.targetId, knowledgeBaseId)),
      and(
        eq(auditLogs.targetType, "document"),
        exists(
          db
            .select({ id: documents.id })
            .from(documents)
            .where(
              and(
                eq(documents.id, auditLogs.targetId),
                eq(documents.knowledgeBaseId, knowledgeBaseId),
              ),
            ),
        ),
      ),
      and(
        eq(auditLogs.targetType, "knowledge_item"),
        exists(
          db
            .select({ id: knowledgeItems.id })
            .from(knowledgeItems)
            .where(
              and(
                eq(knowledgeItems.id, auditLogs.targetId),
                eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId),
              ),
            ),
        ),
      ),
      and(
        eq(auditLogs.targetType, "agent"),
        exists(
          db
            .select({ id: agentKnowledgeBases.id })
            .from(agentKnowledgeBases)
            .where(
              and(
                eq(agentKnowledgeBases.agentId, auditLogs.targetId),
                eq(agentKnowledgeBases.knowledgeBaseId, knowledgeBaseId),
              ),
            ),
        ),
      ),
      and(
        eq(auditLogs.targetType, "tag"),
        exists(
          db
            .select({ id: tags.id })
            .from(tags)
            .where(and(eq(tags.id, auditLogs.targetId), eq(tags.knowledgeBaseId, knowledgeBaseId))),
        ),
      ),
    );
    const condition = or(
      eq(auditLogs.knowledgeBaseId, knowledgeBaseId),
      and(isNull(auditLogs.knowledgeBaseId), legacyCondition),
    );
    if (condition === undefined) {
      throw new Error("Failed to build audit target condition");
    }
    return condition;
  }

  private async fetchTargetLabels(rows: AuditLogRow[]): Promise<Map<string, string>> {
    const idsByType = new Map<AuditTargetType, Set<string>>();
    for (const row of rows) {
      if (row.targetId === null || !this.isAuditTargetType(row.targetType)) {
        continue;
      }
      const ids = idsByType.get(row.targetType) ?? new Set<string>();
      ids.add(row.targetId);
      idsByType.set(row.targetType, ids);
    }

    const labels = new Map<string, string>();
    this.addLabels(
      labels,
      AuditTargetType.KNOWLEDGE_BASE,
      idsByType.get(AuditTargetType.KNOWLEDGE_BASE),
      "知识库",
    );
    this.addLabels(
      labels,
      AuditTargetType.RETRIEVAL_SETTINGS,
      idsByType.get(AuditTargetType.RETRIEVAL_SETTINGS),
      "检索设置",
    );
    this.addLabels(
      labels,
      AuditTargetType.MIND_MAP,
      idsByType.get(AuditTargetType.MIND_MAP),
      "思维导图",
    );
    await Promise.all([
      this.addDocumentLabels(labels, idsByType.get(AuditTargetType.DOCUMENT)),
      this.addKnowledgeItemLabels(labels, idsByType.get(AuditTargetType.KNOWLEDGE_ITEM)),
      this.addAgentLabels(labels, idsByType.get(AuditTargetType.AGENT)),
      this.addTagLabels(labels, idsByType.get(AuditTargetType.TAG)),
    ]);
    return labels;
  }

  private addLabels(
    labels: Map<string, string>,
    targetType: AuditTargetType,
    ids: Set<string> | undefined,
    label: string,
  ): void {
    if (ids === undefined) {
      return;
    }
    for (const id of ids) {
      labels.set(this.labelKey(targetType, id), label);
    }
  }

  private async addDocumentLabels(labels: Map<string, string>, ids: Set<string> | undefined) {
    if (ids === undefined || ids.size === 0) {
      return;
    }
    const rows = await db
      .select({ id: documents.id, title: documents.title })
      .from(documents)
      .where(inArray(documents.id, [...ids]));
    rows.forEach((row) => labels.set(this.labelKey(AuditTargetType.DOCUMENT, row.id), row.title));
  }

  private async addKnowledgeItemLabels(labels: Map<string, string>, ids: Set<string> | undefined) {
    if (ids === undefined || ids.size === 0) {
      return;
    }
    const rows = await db
      .select({ id: knowledgeItems.id, title: knowledgeItems.title })
      .from(knowledgeItems)
      .where(inArray(knowledgeItems.id, [...ids]));
    rows.forEach((row) =>
      labels.set(this.labelKey(AuditTargetType.KNOWLEDGE_ITEM, row.id), row.title),
    );
  }

  private async addAgentLabels(labels: Map<string, string>, ids: Set<string> | undefined) {
    if (ids === undefined || ids.size === 0) {
      return;
    }
    const rows = await db
      .select({ id: agents.id, name: agents.name })
      .from(agents)
      .where(inArray(agents.id, [...ids]));
    rows.forEach((row) => labels.set(this.labelKey(AuditTargetType.AGENT, row.id), row.name));
  }

  private async addTagLabels(labels: Map<string, string>, ids: Set<string> | undefined) {
    if (ids === undefined || ids.size === 0) {
      return;
    }
    const rows = await db
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.id, [...ids]));
    rows.forEach((row) => labels.set(this.labelKey(AuditTargetType.TAG, row.id), row.name));
  }

  private toEntry(row: AuditLogRow, labels: Map<string, string>): AuditLogEntry {
    const targetType = this.isAuditTargetType(row.targetType)
      ? row.targetType
      : AuditTargetType.KNOWLEDGE_BASE;
    const result = row.result === "failure" ? "failure" : "success";
    return {
      id: row.id,
      userId: row.userId,
      userName: row.userName,
      userAvatar: null,
      action: row.action,
      actionLabel: ACTION_LABELS[row.action] ?? row.action,
      targetType,
      targetId: row.targetId,
      targetLabel:
        row.targetId === null
          ? null
          : (labels.get(this.labelKey(targetType, row.targetId)) ?? null),
      result,
      detail: this.record(row.detail),
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private isAuditTargetType(value: string): value is AuditTargetType {
    return (AUDIT_TARGET_TYPES as readonly string[]).includes(value);
  }

  private labelKey(targetType: AuditTargetType, targetId: string): string {
    return `${targetType}:${targetId}`;
  }

  private record(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private async ensureCanManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("Cannot read audit logs in this knowledge base");
  }
}
