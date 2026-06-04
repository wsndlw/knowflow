import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NotFoundException } from "@nestjs/common";
import { db } from "@knowflow/db";

import type { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

type AccessStub = Pick<
  KnowledgeBaseAccessService,
  "buildAccessCondition" | "buildManageCondition" | "canAccess" | "canManage"
>;

type AnalyticsStub = Pick<AnalyticsEventService, "recordSafe">;

type SelectChain = {
  from: (table: unknown) => SelectChain;
  innerJoin: (table: unknown, condition: unknown) => SelectChain;
  where: (condition: unknown) => SelectChain;
  orderBy: (...conditions: unknown[]) => Promise<unknown[]>;
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type ArchiveUpdateValues = {
  status?: unknown;
  updatedAt?: unknown;
};

type MutableDb = {
  select: (selection?: unknown) => SelectChain;
  update: (table: unknown) => UpdateChain;
};

type ServiceInternals = {
  findRowById: (id: string) => Promise<KnowledgeBaseRow | undefined>;
};

type KnowledgeBaseRow = {
  id: string;
  name: string;
  description: string | null;
  departmentId: string;
  departmentName: string;
  visibility: "public" | "department" | "restricted";
  status: "active" | "disabled" | "archived";
  indexStatus: "not_indexed" | "indexing" | "ready" | "partial_failed" | "failed";
  creatorId: string;
  creatorName: string;
  embeddingModel: string;
  embeddingDimension: number;
  createdAt: Date;
  updatedAt: Date;
};

const user: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

void describe("KnowledgeBaseService archive semantics", () => {
  void it("archives a knowledge base instead of physically deleting related records", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeService(access);
    const mutableDb = db as unknown as MutableDb;
    const originalUpdate = mutableDb.update;
    let updateValues: ArchiveUpdateValues = {};

    mutableDb.update = () => ({
      set(values: Record<string, unknown>) {
        updateValues = values;
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
    });

    try {
      await service.delete("00000000-0000-0000-0000-000000000100", user);

      assert.equal(access.canManageCalls, 1);
      assert.equal(updateValues.status, "archived");
      const updatedAt = updateValues.updatedAt;
      assert.equal(Object.prototype.toString.call(updatedAt), "[object Date]");
    } finally {
      mutableDb.update = originalUpdate;
    }
  });

  void it("hides archived knowledge bases from readers even when they otherwise have access", async () => {
    const access = makeAccessStub({ canAccess: true, canManage: false });
    const analytics = makeAnalyticsStub();
    const service = makeService(access, analytics);
    Object.assign(service as object, {
      findRowById: () => Promise.resolve(makeKnowledgeBaseRow({ status: "archived" })),
    } satisfies ServiceInternals);

    await assert.rejects(
      () => service.get("00000000-0000-0000-0000-000000000100", user),
      NotFoundException,
    );
    assert.equal(access.canAccessCalls, 0);
    assert.equal(access.canManageCalls, 1);
    assert.equal(analytics.recorded.length, 0);
  });

  void it("allows managers to view archived knowledge bases", async () => {
    const access = makeAccessStub({ canAccess: false, canManage: true });
    const analytics = makeAnalyticsStub();
    const service = makeService(access, analytics);
    Object.assign(service as object, {
      findRowById: () => Promise.resolve(makeKnowledgeBaseRow({ status: "archived" })),
    } satisfies ServiceInternals);

    const result = await service.get("00000000-0000-0000-0000-000000000100", user);

    assert.equal(result.status, "archived");
    assert.equal(result.canManage, true);
    assert.equal(access.canAccessCalls, 0);
    assert.equal(access.canManageCalls, 1);
    assert.equal(analytics.recorded.length, 1);
  });

  void it("excludes archived knowledge bases from list results by default", async () => {
    const access = makeAccessStub();
    const captured = await captureListCondition(access, {});
    const fragments = collectStringFragments(captured);

    assert.equal(access.buildAccessConditionCalls, 1);
    assert.equal(access.buildManageConditionCalls, 0);
    assert.ok(fragments.includes("archived"));
    assert.ok(fragments.some((fragment) => fragment.includes("<>")));
  });

  void it("uses manage visibility when listing archived knowledge bases", async () => {
    const access = makeAccessStub();
    const captured = await captureListCondition(access, { status: "archived" });
    const fragments = collectStringFragments(captured);

    assert.equal(access.buildAccessConditionCalls, 0);
    assert.equal(access.buildManageConditionCalls, 1);
    assert.ok(fragments.includes("archived"));
    assert.equal(fragments.some((fragment) => fragment.includes("<>")), false);
  });
});

async function captureListCondition(
  access: ReturnType<typeof makeAccessStub>,
  query: Parameters<KnowledgeBaseService["list"]>[0],
): Promise<unknown> {
  const service = makeService(access);
  const mutableDb = db as unknown as MutableDb;
  const originalSelect = mutableDb.select;
  let capturedCondition: unknown;
  const chain: SelectChain = {
    from() {
      return chain;
    },
    innerJoin() {
      return chain;
    },
    where(condition: unknown) {
      capturedCondition = condition;
      return chain;
    },
    orderBy() {
      return Promise.resolve([]);
    },
  };

  mutableDb.select = () => chain;
  try {
    await service.list(query, user);
  } finally {
    mutableDb.select = originalSelect;
  }

  return capturedCondition;
}

function makeService(
  access: AccessStub,
  analytics: AnalyticsStub = makeAnalyticsStub(),
): KnowledgeBaseService {
  return new KnowledgeBaseService(
    access,
    analytics as unknown as AnalyticsEventService,
  );
}

function makeAccessStub(options: { canAccess?: boolean; canManage?: boolean } = {}) {
  return {
    buildAccessConditionCalls: 0,
    buildManageConditionCalls: 0,
    canAccessCalls: 0,
    canManageCalls: 0,
    buildAccessCondition() {
      this.buildAccessConditionCalls += 1;
      return undefined;
    },
    buildManageCondition() {
      this.buildManageConditionCalls += 1;
      return undefined;
    },
    canAccess() {
      this.canAccessCalls += 1;
      return Promise.resolve(options.canAccess ?? true);
    },
    canManage() {
      this.canManageCalls += 1;
      return Promise.resolve(options.canManage ?? true);
    },
  };
}

function makeAnalyticsStub() {
  return {
    recorded: [] as unknown[],
    recordSafe(input: unknown) {
      this.recorded.push(input);
      return Promise.resolve();
    },
  };
}

function makeKnowledgeBaseRow(overrides: Partial<KnowledgeBaseRow> = {}): KnowledgeBaseRow {
  return {
    id: "00000000-0000-0000-0000-000000000100",
    name: "Archived KB",
    description: null,
    departmentId: "00000000-0000-0000-0000-000000000010",
    departmentName: "Engineering",
    visibility: "department",
    status: "archived",
    indexStatus: "ready",
    creatorId: "00000000-0000-0000-0000-000000000001",
    creatorName: "Alice",
    embeddingModel: "text-embedding-v4",
    embeddingDimension: 1024,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    ...overrides,
  };
}

function collectStringFragments(value: unknown): string[] {
  const fragments: string[] = [];
  const seen = new WeakSet();
  collectStrings(value, fragments, seen);
  return fragments;
}

function collectStrings(value: unknown, fragments: string[], seen: WeakSet<object>): void {
  if (typeof value === "string") {
    fragments.push(value);
    return;
  }
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, fragments, seen);
    }
    return;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    collectStrings((value as Record<string, unknown>)[key], fragments, seen);
  }
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    collectStrings((value as Record<symbol, unknown>)[symbol], fragments, seen);
  }
}
