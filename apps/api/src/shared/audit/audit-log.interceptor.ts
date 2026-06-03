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
import { catchError, tap, throwError, type Observable } from "rxjs";

import { AUDIT_LOG_METADATA_KEY, type AuditLogMetadata } from "./audit-log.decorator.js";
import { AuditLogService } from "./audit-log.service.js";

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
    return next.handle().pipe(
      tap((response: unknown) => {
        this.writeAuditLog(request, metadata, "success", response);
      }),
      catchError((error: unknown) => {
        this.writeAuditLog(request, metadata, "failure", undefined, error);
        return throwError(() => error);
      }),
    );
  }

  private writeAuditLog(
    request: RequestWithAuditContext,
    metadata: AuditLogMetadata,
    result: "success" | "failure",
    response?: unknown,
    error?: unknown,
  ): void {
    const detail: Record<string, unknown> = {
      params: this.sanitize(request.params ?? {}),
      query: this.sanitize(request.query ?? {}),
      body: this.sanitize(request.body ?? {}),
    };
    const responseId = this.extractResponseId(response);
    if (responseId !== null) {
      detail["responseId"] = responseId;
    }
    if (error !== undefined) {
      detail["error"] = this.errorMessage(error);
    }

    void this.auditLogService
      .record({
        userId: request.user?.id ?? this.extractResponseUserId(response),
        action: metadata.action,
        targetType: metadata.targetType,
        targetId: this.extractTargetId(metadata.targetType, request, response),
        result,
        detail,
        ip: this.getRequestIp(request),
        userAgent: this.getHeader(request, "user-agent"),
      })
      .catch((auditError: unknown) => {
        this.logger.warn(`Failed to write audit log: ${this.errorMessage(auditError)}`);
      });
  }

  private extractTargetId(
    targetType: AuditTargetType,
    request: RequestWithAuditContext,
    response: unknown,
  ): string | null {
    const responseId = this.extractResponseId(response);
    if (responseId !== null) {
      return responseId;
    }

    const routeId = request.params?.["id"] ?? null;
    if (routeId === null) {
      return null;
    }
    if (
      targetType === AuditTargetType.KNOWLEDGE_BASE ||
      targetType === AuditTargetType.RETRIEVAL_SETTINGS ||
      targetType === AuditTargetType.MIND_MAP ||
      targetType === AuditTargetType.DOCUMENT ||
      targetType === AuditTargetType.KNOWLEDGE_ITEM ||
      targetType === AuditTargetType.AGENT ||
      targetType === AuditTargetType.TAG
    ) {
      return routeId;
    }
    return null;
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

  private sanitize(value: unknown, depth = 0): unknown {
    if (depth > 6) {
      return "[Truncated]";
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item, depth + 1));
    }
    const record = this.asRecord(value);
    if (record === null) {
      return value;
    }

    const sanitized: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      if (this.isSensitiveKey(key)) {
        sanitized[key] = "[Filtered]";
        continue;
      }
      sanitized[key] = this.sanitize(child, depth + 1);
    }
    return sanitized;
  }

  private isSensitiveKey(key: string): boolean {
    return /password|token|apikey|api_key|session/i.test(key);
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

  private getRequestIp(request: RequestWithAuditContext): string | null {
    const forwarded = this.getHeader(request, "x-forwarded-for");
    if (forwarded !== null) {
      return forwarded.split(",")[0]?.trim() ?? null;
    }
    return request.ip ?? request.socket?.remoteAddress ?? null;
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
}
