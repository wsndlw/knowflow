import { SetMetadata } from "@nestjs/common";
import type { AuditTargetType } from "@knowflow/shared";

export const AUDIT_LOG_METADATA_KEY = "knowflow:audit-log";

export type AuditLogMetadata = {
  action: string;
  targetType: AuditTargetType;
};

export const AuditLog = (action: string, targetType: AuditTargetType) =>
  SetMetadata(AUDIT_LOG_METADATA_KEY, { action, targetType } satisfies AuditLogMetadata);
