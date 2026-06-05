import {
  ACCESS_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_SESSION_COOKIE_NAME,
} from "@knowflow/shared";
import { db, hashPassword, sessions, users } from "@knowflow/db";
import { HttpException, UnauthorizedException } from "@nestjs/common";
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { AuthService } from "./auth.service.js";
import { hashSessionToken } from "./session-token.js";
import type { RequestLike, ResponseLike } from "./auth.types.js";

type UserRecord = typeof users.$inferSelect;
type SessionRecord = typeof sessions.$inferSelect;

type TestDb = {
  query: {
    users: {
      findFirst: (input: unknown) => Promise<UserRecord | undefined>;
    };
    sessions: {
      findFirst: (input: unknown) => Promise<SessionRecord | undefined>;
    };
  };
  insert: (table: unknown) => {
    values: (value: unknown) => Promise<void>;
  };
  update: (table: unknown) => {
    set: (value: unknown) => {
      where: (where: unknown) => {
        returning: (selection: unknown) => Promise<{ id: string }[]>;
      };
    };
  };
};

const testUser: UserRecord = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  passwordHash: hashPassword("correct-password"),
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000002",
  status: "active",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const initialTestDb = asTestDb();
const originalQuery = initialTestDb.query;
const originalInsert = initialTestDb.insert;
const originalUpdate = initialTestDb.update;

let usersFindFirst: (input: unknown) => Promise<UserRecord | undefined>;
let sessionsFindFirst: (input: unknown) => Promise<SessionRecord | undefined>;
let insertedSessions: Partial<SessionRecord>[] = [];
let revokedSessionCount = 0;
let revokeReturnsRows = true;

function asTestDb(): TestDb {
  return db as unknown as TestDb;
}

function request(cookie?: string): RequestLike {
  const headers: RequestLike["headers"] = {
    "user-agent": "node-test",
    "x-forwarded-for": "203.0.113.10",
  };
  if (cookie !== undefined) {
    headers.cookie = cookie;
  }

  return {
    headers,
    ip: "127.0.0.1",
    socket: {
      remoteAddress: "127.0.0.1",
    },
  };
}

function response(): ResponseLike & { cookies: string[] } {
  return {
    cookies: [],
    setHeader(name: string, value: string | string[]): void {
      if (name === "Set-Cookie") {
        this.cookies = Array.isArray(value) ? value : [value];
      }
    },
  };
}

function cookieValue(cookies: string[], name: string): string {
  const cookie = cookies.find((value) => value.startsWith(`${name}=`));
  assert.ok(cookie);
  return cookie.slice(name.length + 1, cookie.indexOf(";"));
}

function sessionRecord(input: {
  token: string;
  type: "access" | "refresh";
  revokedAt?: Date | null;
}): SessionRecord {
  return {
    id: `00000000-0000-0000-0000-0000000000${input.type === "access" ? "10" : "20"}`,
    userId: testUser.id,
    sessionTokenHash: hashSessionToken(input.token),
    type: input.type,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: input.revokedAt ?? null,
    lastSeenAt: null,
    ip: "127.0.0.1",
    userAgent: "node-test",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  usersFindFirst = () => Promise.resolve(testUser);
  sessionsFindFirst = () => Promise.resolve(undefined);
  insertedSessions = [];
  revokedSessionCount = 0;
  revokeReturnsRows = true;

  const testDb = asTestDb();
  testDb.query = {
    users: {
      findFirst(input: unknown): Promise<UserRecord | undefined> {
        return usersFindFirst(input);
      },
    },
    sessions: {
      findFirst(input: unknown): Promise<SessionRecord | undefined> {
        return sessionsFindFirst(input);
      },
    },
  };
  testDb.insert = () => ({
    values(value: unknown): Promise<void> {
      insertedSessions.push(value as Partial<SessionRecord>);
      return Promise.resolve();
    },
  });
  testDb.update = () => ({
    set(value: unknown) {
      const revokedAt = (value as Partial<SessionRecord>).revokedAt;
      return {
        where() {
          if (revokedAt instanceof Date) {
            revokedSessionCount += 1;
          }
          return {
            returning(): Promise<{ id: string }[]> {
              return Promise.resolve(
                revokedAt instanceof Date && revokeReturnsRows ? [{ id: "session-id" }] : [],
              );
            },
          };
        },
      };
    },
  });
});

afterEach(() => {
  const testDb = asTestDb();
  testDb.query = originalQuery;
  testDb.insert = originalInsert;
  testDb.update = originalUpdate;
  delete process.env["TRUST_PROXY"];
});

void describe("AuthService", () => {
  void it("limits repeated failed logins by username and client IP", async () => {
    const service = new AuthService();
    const req = request();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await assert.rejects(
        service.login({ username: "alice", password: "wrong-password" }, req, response()),
        UnauthorizedException,
      );
    }

    await assert.rejects(
      service.login({ username: "alice", password: "wrong-password" }, req, response()),
      (error: unknown) => error instanceof HttpException && error.getStatus() === 429,
    );
  });

  void it("rotates refresh sessions and resets CSRF on refresh", async () => {
    const service = new AuthService();
    const oldAccess = "old-access";
    const oldRefresh = "old-refresh";
    sessionsFindFirst = () =>
      Promise.resolve(sessionRecord({ token: oldRefresh, type: "refresh" }));
    const res = response();

    await service.refresh(
      request(
        `${ACCESS_SESSION_COOKIE_NAME}=${oldAccess}; ${REFRESH_SESSION_COOKIE_NAME}=${oldRefresh}`,
      ),
      res,
    );

    assert.equal(insertedSessions.length, 2);
    assert.deepEqual(
      insertedSessions.map((session) => session.type).sort(),
      ["access", "refresh"],
    );
    assert.ok(revokedSessionCount >= 2);
    assert.ok(cookieValue(res.cookies, ACCESS_SESSION_COOKIE_NAME));
    assert.ok(cookieValue(res.cookies, REFRESH_SESSION_COOKIE_NAME));
    assert.ok(cookieValue(res.cookies, CSRF_COOKIE_NAME));
  });

  void it("rejects a reused revoked refresh token", async () => {
    const service = new AuthService();
    sessionsFindFirst = () =>
      Promise.resolve(
        sessionRecord({
          token: "old-refresh",
          type: "refresh",
          revokedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      );

    await assert.rejects(
      service.refresh(request(`${REFRESH_SESSION_COOKIE_NAME}=old-refresh`), response()),
      UnauthorizedException,
    );
  });

  void it("rejects disabled users during login and session authentication", async () => {
    const service = new AuthService();
    const disabledUser: UserRecord = { ...testUser, status: "disabled" };
    usersFindFirst = () => Promise.resolve(disabledUser);
    sessionsFindFirst = () =>
      Promise.resolve(sessionRecord({ token: "access-token", type: "access" }));

    await assert.rejects(
      service.login({ username: "alice", password: "correct-password" }, request(), response()),
      UnauthorizedException,
    );
    await assert.rejects(
      service.authenticateRequest(request(`${ACCESS_SESSION_COOKIE_NAME}=access-token`)),
      UnauthorizedException,
    );
  });

  void it("does not mint new sessions when refresh revocation loses the active-session race", async () => {
    const service = new AuthService();
    sessionsFindFirst = () =>
      Promise.resolve(sessionRecord({ token: "old-refresh", type: "refresh" }));
    revokeReturnsRows = false;

    await assert.rejects(
      service.refresh(request(`${REFRESH_SESSION_COOKIE_NAME}=old-refresh`), response()),
      UnauthorizedException,
    );
    assert.equal(insertedSessions.length, 0);
  });

  void it("does not trust x-forwarded-for when TRUST_PROXY is not enabled", async () => {
    const service = new AuthService();

    await service.login({ username: "alice", password: "correct-password" }, request(), response());

    assert.equal(insertedSessions.length, 2);
    assert.deepEqual(
      insertedSessions.map((session) => session.ip),
      ["127.0.0.1", "127.0.0.1"],
    );
  });
});
