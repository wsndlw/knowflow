import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from "@knowflow/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { csrfMiddleware } from "./csrf.middleware.js";

type ProbeResult = {
  nextCalled: boolean;
  statusCode: number;
  body: unknown;
};

const VALID_TOKEN = "a".repeat(64);
const OTHER_VALID_TOKEN = "b".repeat(64);

function runProbe(input: {
  method: string;
  path: string;
  cookie?: string;
  header?: string;
}): ProbeResult {
  const result: ProbeResult = {
    nextCalled: false,
    statusCode: 0,
    body: undefined,
  };
  const headers: { cookie?: string } = {};
  if (input.cookie !== undefined) {
    headers.cookie = input.cookie;
  }

  csrfMiddleware(
    {
      method: input.method,
      path: input.path,
      headers,
      get(name: string): string | undefined {
        return name === CSRF_HEADER_NAME ? input.header : undefined;
      },
    },
    {
      status(code: number): { json: (body: unknown) => void } {
        result.statusCode = code;
        return {
          json(body: unknown): void {
            result.body = body;
          },
        };
      },
    },
    () => {
      result.nextCalled = true;
    },
  );

  return result;
}

function expectForbidden(result: ProbeResult): void {
  assert.equal(result.nextCalled, false);
  assert.equal(result.statusCode, 403);
  assert.deepEqual(result.body, {
    ok: false,
    error: {
      code: "CSRF_FAILED",
      message: "CSRF 令牌验证失败",
    },
  });
}

void describe("csrfMiddleware", () => {
  void it("allows safe methods without a token", () => {
    assert.equal(runProbe({ method: "GET", path: "/documents/1" }).nextCalled, true);
  });

  void it("allows exact login and refresh exemptions", () => {
    assert.equal(runProbe({ method: "POST", path: "/auth/login" }).nextCalled, true);
    assert.equal(runProbe({ method: "POST", path: "/auth/refresh" }).nextCalled, true);
  });

  void it("rejects missing cookie", () => {
    expectForbidden(runProbe({ method: "POST", path: "/auth/logout", header: VALID_TOKEN }));
  });

  void it("rejects missing header", () => {
    expectForbidden(
      runProbe({
        method: "POST",
        path: "/auth/logout",
        cookie: `${CSRF_COOKIE_NAME}=${VALID_TOKEN}`,
      }),
    );
  });

  void it("rejects empty cookie and header values", () => {
    expectForbidden(
      runProbe({
        method: "POST",
        path: "/auth/logout",
        cookie: `${CSRF_COOKIE_NAME}=`,
        header: "",
      }),
    );
  });

  void it("rejects malformed token values", () => {
    expectForbidden(
      runProbe({
        method: "POST",
        path: "/auth/logout",
        cookie: `${CSRF_COOKIE_NAME}=not-hex`,
        header: "not-hex",
      }),
    );
  });

  void it("rejects mismatched valid tokens", () => {
    expectForbidden(
      runProbe({
        method: "POST",
        path: "/auth/logout",
        cookie: `${CSRF_COOKIE_NAME}=${VALID_TOKEN}`,
        header: OTHER_VALID_TOKEN,
      }),
    );
  });

  void it("allows matching valid tokens", () => {
    const result = runProbe({
      method: "POST",
      path: "/auth/logout",
      cookie: `${CSRF_COOKIE_NAME}=${VALID_TOKEN}`,
      header: VALID_TOKEN,
    });

    assert.equal(result.nextCalled, true);
    assert.equal(result.statusCode, 0);
  });
});
