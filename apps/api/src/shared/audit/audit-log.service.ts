import { Injectable } from "@nestjs/common";
import { auditLogs, db } from "@knowflow/db";
import type { AuditResult, AuditTargetTypeValue } from "@knowflow/shared";

@Injectable()
export class AuditLogService {
  async record(input: {
    userId: string | null;
    action: string;
    targetType: AuditTargetTypeValue;
    targetId: string | null;
    result: AuditResult;
    detail: Record<string, unknown>;
    ip: string | null;
    userAgent: string | null;
  }): Promise<void> {
    await db.insert(auditLogs).values({
      userId: input.userId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      result: input.result,
      detail: input.detail,
      ip: input.ip,
      userAgent: input.userAgent,
    });
  }
}
