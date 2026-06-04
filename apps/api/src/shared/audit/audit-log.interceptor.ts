import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditTargetType } from "@knowflow/shared";
import { catchError, from, mergeMap, tap, throwError, type Observable } from "rxjs";

import { AUDIT_LOG_METADATA_KEY, type AuditLogMetadata } from "./audit-log.decorator.js";
import { AuditLogService } from "./audit-log.service.js";
import { getClientIp } from "../net/client-ip.js";

type RequestWithAuditContext = {
  user?: {
    id: string;
  };
  params?: Record<string, string | undefined>;
  body?: unknown;
  query?: unknown;
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
};

const SENSITIVE_BUSINESS_KEYS = new Set([
  "content",
  "correctionContent",
  "systemPrompt",
  "prompt",
  "messages",
  "metadata",
  "sourceContext",
  "reasoning",
  "answer",
]);

const ACTION_BODY_SUMMARY_KEYS: Record<string, readonly string[]> = {
  "agent.create": ["name", "description", "knowledgeBaseIds"],
  "agent.update": ["name", "description", "status", "knowledgeBaseIds"],
  "document.reprocess": ["reason"],
  "department.create": ["name"],
  "department.update": ["name"],
  "department.member.add": ["userId"],
  "department.member.transfer": ["targetDepartmentId"],
  "user.department.assign": ["departmentId"],
  "kb.admin.set": ["userId"],
  "kb.admin.unset": ["userId"],
  "kb.create": ["name", "departmentId", "visibility"],
  "kb.member.add": ["userId", "role"],
  "kb.member.remove": ["userId"],
  "kb.update": ["name", "description", "visibility", "status"],
  "knowledge_item.create": ["title", "summary", "status", "tagIds"],
  "knowledge_item.update": ["title", "summary", "status", "tagIds"],
  "knowledge_item.publish": ["status"],
  "knowledge_item.unpublish": ["status"],
  "retrieval_settings.update": ["strategy", "topK", "scoreThreshold"],
  "tag.create": ["name", "color"],
  "tag.update": ["name", "color"],
};

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    @Inject(Reflector)
    private readonly reflector: Reflector,
    @Inject(AuditLogService)
    private readonly auditLogService: AuditLogService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditLogMetadata | undefined>(
      AUDIT_LOG_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (metadata === undefined) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestWithAuditContext>();
    return from(this.resolvePreActionKnowledgeBaseId(metadata, request)).pipe(
      mergeMap((knowledgeBaseId) =>
        next.handle().pipe(
          tap((response: unknown) => {
            this.writeAuditLog(request, metadata, knowledgeBaseId, "success", response);
          }),
          catchError((error: unknown) => {
            this.writeAuditLog(request, metadata, knowledgeBaseId, "failure", undefined, error);
            return throwError(() => error);
          }),
        ),
      ),
    );
  }

  private writeAuditLog(
    request: RequestWithAuditContext,
    metadata: AuditLogMetadata,
    knowledgeBaseId: string | null,
    result: "success" | "failure",
    response?: unknown,
    error?: unknown,
  ): void {
    const detail: Record<string, unknown> = {
      params: this.sanitizeForAudit(request.params ?? {}),
      query: this.sanitizeForAudit(request.query ?? {}),
    };
    const bodySummary = this.buildBodySummary(metadata.action, request.body);
    if (Object.keys(bodySummary).length > 0) {
      detail["body"] = bodySummary;
    }
    const responseId = this.extractResponseId(response);
    if (responseId !== null) {
      detail["responseId"] = responseId;
    }
    if (error !== undefined) {
      detail["error"] = this.errorSummary(error);
    }

    void this.auditLogService
      .record({
        userId: request.user?.id ?? this.extractResponseUserId(response),
        knowledgeBaseId,
        action: metadata.action,
        targetType: metadata.targetType,
        targetId: this.extractTargetId(request, response),
        result,
        detail,
        ip: getClientIp(request),
        userAgent: this.getHeader(request, "user-agent"),
      })
      .catch((auditError: unknown) => {
        this.logger.warn(`Failed to write audit log: ${this.errorMessage(auditError)}`);
      });
  }

  private async resolvePreActionKnowledgeBaseId(
    metadata: AuditLogMetadata,
    request: RequestWithAuditContext,
  ): Promise<string | null> {
    const routeKnowledgeBaseId = this.extractRouteKnowledgeBaseId(metadata, request);
    if (routeKnowledgeBaseId !== null) {
      return routeKnowledgeBaseId;
    }
    const routeTargetId = this.extractTargetId(request, undefined);
    return this.auditLogService.resolveKnowledgeBaseId(metadata.targetType, routeTargetId);
  }

  private extractRouteKnowledgeBaseId(
    metadata: AuditLogMetadata,
    request: RequestWithAuditContext,
  ): string | null {
    const routeId = request.params?.["id"] ?? null;
    if (routeId === null) {
      return null;
    }
    if (
      metadata.targetType === AuditTargetType.KNOWLEDGE_BASE ||
      metadata.targetType === AuditTargetType.RETRIEVAL_SETTINGS ||
      metadata.targetType === AuditTargetType.MIND_MAP ||
      metadata.action === "document.upload" ||
      metadata.action === "knowledge_item.create" ||
      metadata.action === "agent.create" ||
      metadata.action === "agent.generate" ||
      metadata.action === "tag.create"
    ) {
      return routeId;
    }
    return null;
  }

  private extractTargetId(request: RequestWithAuditContext, response: unknown): string | null {
    const responseId = this.extractResponseId(response);
    if (responseId !== null) {
      return responseId;
    }

    const routeId = request.params?.["id"] ?? null;
    if (routeId === null) {
      return null;
    }
    return routeId;
  }

  private extractResponseId(response: unknown): string | null {
    const data = this.asRecord(response)?.["data"];
    const dataRecord = this.asRecord(data);
    const directId = dataRecord?.["id"];
    if (typeof directId === "string") {
      return directId;
    }
    const agentId = this.asRecord(dataRecord?.["agent"])?.["id"];
    if (typeof agentId === "string") {
      return agentId;
    }
    return null;
  }

  private extractResponseUserId(response: unknown): string | null {
    const data = this.asRecord(response)?.["data"];
    const userId =
      this.asRecord(data)?.["user"] !== undefined
        ? this.asRecord(this.asRecord(data)?.["user"])?.["id"]
        : undefined;
    return typeof userId === "string" ? userId : null;
  }

  private buildBodySummary(action: string, body: unknown): Record<string, unknown> {
    const allowedKeys = ACTION_BODY_SUMMARY_KEYS[action];
    const record = this.asRecord(body);
    if (allowedKeys === undefined || record === null) {
      return {};
    }

    const summary: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        summary[key] = this.sanitizeForAudit(record[key]);
      }
    }
    return summary;
  }

  private sanitizeForAudit(value: unknown, depth = 0): unknown {
    if (depth > 6) {
      return "[Truncated]";
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeForAudit(item, depth + 1));
    }
    const record = this.asRecord(value);
    if (record === null) {
      return this.truncateScalar(value);
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = "[Filtered]";
        continue;
      }
      sanitized[key] = this.sanitizeForAudit(child, depth + 1);
    }
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    return (
      /password|token|apikey|api_key|session|secret|credential/i.test(key) ||
      SENSITIVE_BUSINESS_KEYS.has(key)
    );
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private getHeader(request: RequestWithAuditContext, name: string): string | null {
    const value = request.headers[name.toLowerCase()] ?? request.headers[name];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }
    return value ?? null;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    return "Unknown error";
  }

  private errorSummary(error: unknown): Record<string, string> {
    return {
      type: error instanceof Error ? error.constructor.name : typeof error,
      message: this.truncateString(this.errorMessage(error), 200),
    };
  }

  private truncateScalar(value: unknown): unknown {
    if (typeof value === "string") {
      return this.truncateString(value, 200);
    }
    return value;
  }

  private truncateString(value: string, maxLength: number): string {
    return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
  }
}
