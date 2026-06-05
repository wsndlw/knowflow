import { AuditTargetType } from "@knowflow/shared";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import type { Reflector } from "@nestjs/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { firstValueFrom, of, throwError } from "rxjs";

import { AUDIT_LOG_METADATA_KEY, type AuditLogMetadata } from "./audit-log.decorator.js";
import { AuditLogInterceptor } from "./audit-log.interceptor.js";
import type { AuditLogService } from "./audit-log.service.js";

type RecordedAudit = Parameters<AuditLogService["record"]>[0];

class FakeAuditLogService {
  readonly records: RecordedAudit[] = [];

  record(input: RecordedAudit): Promise<void> {
    this.records.push(input);
    return Promise.resolve();
  }

  resolveKnowledgeBaseId(): Promise<string | null> {
    return Promise.resolve(null);
  }
}

function reflector(metadata: AuditLogMetadata): Reflector {
  return {
    getAllAndOverride(key: string): AuditLogMetadata | undefined {
      return key === AUDIT_LOG_METADATA_KEY ? metadata : undefined;
    },
  } as unknown as Reflector;
}

function context(request: unknown): ExecutionContext {
  return {
    getHandler(): () => void {
      return () => undefined;
    },
    getClass(): new () => unknown {
      return class {};
    },
    switchToHttp() {
      return {
        getRequest(): unknown {
          return request;
        },
      };
    },
  } as unknown as ExecutionContext;
}

function handler(response: unknown): CallHandler {
  return {
    handle() {
      return of(response);
    },
  };
}

void describe("AuditLogInterceptor", () => {
  void it("records a safe body summary without business content", async () => {
    const auditLogService = new FakeAuditLogService();
    const interceptor = new AuditLogInterceptor(
      reflector({ action: "knowledge_item.create", targetType: AuditTargetType.KNOWLEDGE_ITEM }),
      auditLogService,
    );

    await firstValueFrom(
      interceptor.intercept(
        context({
          user: { id: "user-1" },
          params: { id: "kb-1" },
          query: { page: "1", token: "secret-token" },
          body: {
            title: "Vacation policy",
            content: "This full article body must not be logged",
            messages: [{ role: "user", content: "private prompt" }],
            metadata: { source: "document" },
          },
          headers: {
            "user-agent": "node-test",
            "x-forwarded-for": "203.0.113.10",
          },
          ip: "127.0.0.1",
          socket: { remoteAddress: "127.0.0.1" },
        }),
        handler({ ok: true, data: { id: "item-1" } }),
      ),
    );

    assert.equal(auditLogService.records.length, 1);
    const record = auditLogService.records[0];
    assert.ok(record);
    assert.equal(record.ip, "127.0.0.1");
    assert.deepEqual(record.detail["body"], { title: "Vacation policy" });
    assert.deepEqual(record.detail["query"], { page: "1", token: "[Filtered]" });
    assert.equal(JSON.stringify(record.detail).includes("This full article body must not be logged"), false);
    assert.equal(JSON.stringify(record.detail).includes("private prompt"), false);
  });

  void it("stores only a sanitized error summary on failures", async () => {
    const auditLogService = new FakeAuditLogService();
    const interceptor = new AuditLogInterceptor(
      reflector({ action: "kb.update", targetType: AuditTargetType.KNOWLEDGE_BASE }),
      auditLogService,
    );
    const failingHandler: CallHandler = {
      handle() {
        return throwError(() => new Error("database stack detail ".repeat(20)));
      },
    };

    await assert.rejects(
      firstValueFrom(
        interceptor.intercept(
          context({
            user: { id: "user-1" },
            params: { id: "kb-1" },
            body: { name: "Team KB", content: "private body" },
            headers: {},
            ip: "127.0.0.1",
          }),
          failingHandler,
        ),
      ),
    );

    const record = auditLogService.records[0];
    assert.ok(record);
    assert.equal(record.result, "failure");
    assert.deepEqual(record.detail["body"], { name: "Team KB" });
    assert.match(JSON.stringify(record.detail["error"]), /Error/);
    assert.equal(JSON.stringify(record.detail).includes("private body"), false);
  });

  void it("uses route ids for user audit targets without logging passwords", async () => {
    const auditLogService = new FakeAuditLogService();
    const interceptor = new AuditLogInterceptor(
      reflector({ action: "user.password.reset", targetType: AuditTargetType.USER }),
      auditLogService,
    );

    await firstValueFrom(
      interceptor.intercept(
        context({
          user: { id: "admin-1" },
          params: { id: "user-1" },
          body: { password: "new-password-123" },
          headers: {},
          ip: "127.0.0.1",
        }),
        handler({ ok: true, data: {} }),
      ),
    );

    const record = auditLogService.records[0];
    assert.ok(record);
    assert.equal(record.targetId, "user-1");
    assert.equal(JSON.stringify(record.detail).includes("new-password-123"), false);
    assert.equal(record.detail["body"], undefined);
  });
});
