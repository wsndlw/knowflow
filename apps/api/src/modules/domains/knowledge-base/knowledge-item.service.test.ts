import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { db } from "@knowflow/db";
import type { KnowledgeItem } from "@knowflow/shared";

import type { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import type { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";

type AccessStub = Pick<KnowledgeBaseAccessService, "canAccess" | "canManage"> & {
  canAccessCalls: number;
  canManageCalls: number;
};

type LlmStub = Pick<AliyunLlmService, "embedTexts">;

type AnalyticsStub = Pick<AnalyticsEventService, "recordSafe">;

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type MutableDb = {
  update: (table: unknown) => UpdateChain;
};

type KnowledgeItemMutationInternals = {
  findRow: (id: string, userId: string) => Promise<KnowledgeItemRow | undefined>;
  get: (
    id: string,
    user: AuthenticatedUser,
    options?: { incrementView?: boolean },
  ) => Promise<KnowledgeItem>;
};

type KnowledgeItemListConditionInternals = {
  buildListCondition: (
    knowledgeBaseId: string,
    query: Parameters<KnowledgeItemService["listByKnowledgeBase"]>[1],
    canManage: boolean,
  ) => unknown;
};

type KnowledgeItemRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  title: string;
  content: string;
  summary: string | null;
  sourceDocumentId: string | null;
  status: KnowledgeItem["status"];
  metadata: unknown;
  enabled: boolean;
  viewCount: number;
  citeCount: number;
  likeCount: number;
  dislikeCount: number;
  userFeedback: KnowledgeItem["userFeedback"];
  createdBy: string;
  updatedBy: string | null;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type KnowledgeItemUpdateValues = {
  status?: unknown;
  enabled?: unknown;
  updatedBy?: unknown;
  updatedAt?: unknown;
};

const user: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

void describe("KnowledgeItemService archive semantics", () => {
  void it("archives a knowledge item by hiding it from recall until it is published again", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeServiceHarness(access, makeKnowledgeItemRow({ status: "published" }));
    const updateValues = await captureUpdateValues(() =>
      service.archive("00000000-0000-0000-0000-000000000100", user),
    );

    assert.equal(access.canManageCalls, 1);
    assert.equal(updateValues.status, "archived");
    assert.equal(updateValues.enabled, false);
    assert.equal(updateValues.updatedBy, user.id);
    assert.equal(Object.prototype.toString.call(updateValues.updatedAt), "[object Date]");
  });

  void it("restores an archived knowledge item to unpublished so it can be published again", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeServiceHarness(access, makeKnowledgeItemRow({ status: "archived" }));
    const updateValues = await captureUpdateValues(() =>
      service.restore("00000000-0000-0000-0000-000000000100", user),
    );

    assert.equal(access.canManageCalls, 1);
    assert.equal(updateValues.status, "unpublished");
    assert.equal(updateValues.enabled, false);
    assert.equal(updateValues.updatedBy, user.id);
    assert.equal(Object.prototype.toString.call(updateValues.updatedAt), "[object Date]");
  });

  void it("requires manage permission to archive or restore knowledge items", async () => {
    const access = makeAccessStub({ canManage: false });
    const service = makeServiceHarness(access, makeKnowledgeItemRow());

    await assert.rejects(
      () => service.archive("00000000-0000-0000-0000-000000000100", user),
      ForbiddenException,
    );
    await assert.rejects(
      () => service.restore("00000000-0000-0000-0000-000000000100", user),
      ForbiddenException,
    );
    assert.equal(access.canManageCalls, 2);
  });

  void it("rejects direct PATCH to archived so the archive endpoint owns enabled semantics", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeServiceHarness(access, makeKnowledgeItemRow({ status: "published" }));
    const updateCalls = await captureUpdateCalls(() =>
      service.update("00000000-0000-0000-0000-000000000100", { status: "archived" }, user),
    );

    assert.equal(access.canManageCalls, 1);
    assert.equal(updateCalls, 0);
  });

  void it("keeps reader-visible and RAG-eligible list conditions pinned to published enabled items", () => {
    const service = makeService(makeAccessStub());
    const condition = (service as unknown as KnowledgeItemListConditionInternals).buildListCondition(
      "00000000-0000-0000-0000-000000000200",
      { page: 1, pageSize: 20, tagIds: [] },
      false,
    );
    const values = collectValues(condition);

    assert.ok(values.includes("published"));
    assert.ok(values.includes(true));
  });

  void it("excludes archived items from manager lists by default", () => {
    const service = makeService(makeAccessStub());
    const condition = (service as unknown as KnowledgeItemListConditionInternals).buildListCondition(
      "00000000-0000-0000-0000-000000000200",
      { page: 1, pageSize: 20, tagIds: [] },
      true,
    );
    const fragments = collectStringFragments(condition);

    assert.ok(fragments.includes("archived"));
    assert.ok(fragments.some((fragment) => fragment.includes("<>")));
  });

  void it("shows archived items only when managers request the archived status", () => {
    const service = makeService(makeAccessStub());
    const condition = (service as unknown as KnowledgeItemListConditionInternals).buildListCondition(
      "00000000-0000-0000-0000-000000000200",
      { page: 1, pageSize: 20, tagIds: [], status: "archived" },
      true,
    );
    const fragments = collectStringFragments(condition);

    assert.ok(fragments.includes("archived"));
    assert.equal(fragments.some((fragment) => fragment.includes("<>")), false);
  });
});

async function captureUpdateValues(action: () => Promise<KnowledgeItem>): Promise<KnowledgeItemUpdateValues> {
  const mutableDb = db as unknown as MutableDb;
  const originalUpdate = mutableDb.update;
  let updateValues: KnowledgeItemUpdateValues = {};

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
    await action();
  } finally {
    mutableDb.update = originalUpdate;
  }

  return updateValues;
}

async function captureUpdateCalls(action: () => Promise<KnowledgeItem>): Promise<number> {
  const mutableDb = db as unknown as MutableDb;
  const originalUpdate = mutableDb.update;
  let updateCalls = 0;

  mutableDb.update = () => {
    updateCalls += 1;
    return {
      set() {
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
    };
  };

  try {
    await assert.rejects(action, BadRequestException);
  } finally {
    mutableDb.update = originalUpdate;
  }

  return updateCalls;
}

function makeServiceHarness(
  access: AccessStub,
  row: KnowledgeItemRow,
): KnowledgeItemService {
  const service = makeService(access);
  const internals = service as unknown as KnowledgeItemMutationInternals;
  internals.findRow = () => Promise.resolve(row);
  internals.get = () => Promise.resolve(makeKnowledgeItem(row));
  return service;
}

function makeService(access: AccessStub): KnowledgeItemService {
  return new KnowledgeItemService(
    access as unknown as KnowledgeBaseAccessService,
    makeLlmStub() as unknown as AliyunLlmService,
    makeAnalyticsStub() as unknown as AnalyticsEventService,
  );
}

function makeAccessStub(options: { canAccess?: boolean; canManage?: boolean } = {}): AccessStub {
  return {
    canAccessCalls: 0,
    canManageCalls: 0,
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

function makeLlmStub(): LlmStub {
  return {
    embedTexts() {
      return Promise.resolve([]);
    },
  };
}

function makeAnalyticsStub(): AnalyticsStub {
  return {
    recordSafe() {
      return Promise.resolve();
    },
  };
}

function makeKnowledgeItemRow(overrides: Partial<KnowledgeItemRow> = {}): KnowledgeItemRow {
  return {
    id: "00000000-0000-0000-0000-000000000100",
    knowledgeBaseId: "00000000-0000-0000-0000-000000000200",
    knowledgeBaseName: "Knowledge Base",
    title: "Knowledge item",
    content: "Published content",
    summary: null,
    sourceDocumentId: null,
    status: "published",
    metadata: {},
    enabled: true,
    viewCount: 0,
    citeCount: 0,
    likeCount: 0,
    dislikeCount: 0,
    userFeedback: null,
    createdBy: user.id,
    updatedBy: user.id,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    ...overrides,
  };
}

function makeKnowledgeItem(row: KnowledgeItemRow): KnowledgeItem {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledgeBaseId,
    knowledgeBaseName: row.knowledgeBaseName,
    title: row.title,
    content: row.content,
    summary: row.summary,
    sourceDocumentId: row.sourceDocumentId,
    status: row.status,
    metadata: {},
    enabled: row.enabled,
    viewCount: row.viewCount,
    citeCount: row.citeCount,
    likeCount: row.likeCount,
    dislikeCount: row.dislikeCount,
    userFeedback: row.userFeedback,
    tags: [],
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    verifiedBy: row.verifiedBy,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function collectValues(value: unknown): unknown[] {
  const values: unknown[] = [];
  const seen = new WeakSet();
  collect(value, values, seen);
  return values;
}

function collectStringFragments(value: unknown): string[] {
  const fragments: string[] = [];
  const seen = new WeakSet();
  collectStrings(value, fragments, seen);
  return fragments;
}

function collect(value: unknown, values: unknown[], seen: WeakSet<object>): void {
  if (value === null || typeof value !== "object") {
    values.push(value);
    return;
  }
  if (seen.has(value)) {
    return;
  }

  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      collect(item, values, seen);
    }
    return;
  }

  for (const key of Object.getOwnPropertyNames(value)) {
    collect((value as Record<string, unknown>)[key], values, seen);
  }
  for (const symbol of Object.getOwnPropertySymbols(value)) {
    collect((value as Record<symbol, unknown>)[symbol], values, seen);
  }
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
