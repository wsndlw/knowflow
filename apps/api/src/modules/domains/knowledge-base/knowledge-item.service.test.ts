import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForbiddenException } from "@nestjs/common";
import { db, knowledgeItems } from "@knowflow/db";
import type { KnowledgeItem } from "@knowflow/shared";
import type { SQL } from "drizzle-orm";

import type { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import type { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import type { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import { KnowledgeItemService } from "./knowledge-item.service.js";

type AccessStub = Pick<KnowledgeBaseAccessService, "canAccess" | "canManage"> & {
  canAccessCalls: number;
  canManageCalls: number;
};

type LlmStub = Pick<AliyunLlmService, "embedTexts">;

type AnalyticsStub = Pick<AnalyticsEventService, "recordSafe">;

type InsertChain = {
  values: (values: Record<string, unknown>) => {
    returning: (selection: unknown) => Promise<unknown[]>;
  };
};

type DeleteChain = {
  where: (condition: unknown) => Promise<unknown[]>;
};

type TransactionClient = {
  delete: (table: unknown) => DeleteChain;
  insert: (table: unknown) => InsertChain;
  update: (table: unknown) => UpdateChain;
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type MutableDb = {
  transaction: <T>(callback: (tx: TransactionClient) => Promise<T>) => Promise<T>;
  update: (table: unknown) => UpdateChain;
};

type ImprovementStub = Pick<KnowledgeImprovementService, "triggerFromItemFeedback"> & {
  calls: string[];
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
  ) => SQL | undefined;
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

  void it("keeps reader-visible and RAG-eligible list conditions pinned to published enabled items", () => {
    const service = makeService(makeAccessStub());
    const condition = (
      service as unknown as KnowledgeItemListConditionInternals
    ).buildListCondition(
      "00000000-0000-0000-0000-000000000200",
      { page: 1, pageSize: 20, tagIds: [] },
      false,
    );
    const values = collectValues(condition);

    assert.ok(values.includes("published"));
    assert.ok(values.includes(true));
  });

  void it("hides archived items from manager default list conditions", () => {
    const condition = buildListConditionSql({ page: 1, pageSize: 20, tagIds: [] }, true);

    assert.match(condition.sql, /<>|!=/);
    assert.ok(condition.params.includes("archived"));
  });

  void it("allows managers to request archived items explicitly", () => {
    const condition = buildListConditionSql(
      { page: 1, pageSize: 20, tagIds: [], status: "archived" },
      true,
    );

    assert.doesNotMatch(condition.sql, /<>|!=/);
    assert.ok(condition.params.includes("archived"));
  });
});

void describe("KnowledgeItemService feedback immediate improvement", () => {
  void it("triggers immediate improvement for new dislikes", async () => {
    const improvement = makeImprovementStub();
    const row = makeKnowledgeItemRow({ userFeedback: null });
    const service = makeServiceHarness(makeAccessStub(), row, { improvement });
    const { inserts, restore } = captureFeedbackTransaction({
      createdFeedbackId: "00000000-0000-0000-0000-000000000700",
    });

    try {
      const result = await service.setFeedback(row.id, { rating: "dislike" }, user);

      assert.equal(result.id, row.id);
      assert.equal(improvement.calls.length, 1);
      assert.equal(improvement.calls[0], "00000000-0000-0000-0000-000000000700");
      assert.equal(inserts[0]?.["rating"], "dislike");
    } finally {
      restore();
    }
  });

  void it("does not trigger immediate improvement for likes or repeated dislikes", async () => {
    const likeImprovement = makeImprovementStub();
    const likeRow = makeKnowledgeItemRow({ userFeedback: null });
    const likeService = makeServiceHarness(makeAccessStub(), likeRow, {
      improvement: likeImprovement,
    });
    const likeDb = captureFeedbackTransaction({
      createdFeedbackId: "00000000-0000-0000-0000-000000000701",
    });
    try {
      await likeService.setFeedback(likeRow.id, { rating: "like" }, user);
      assert.equal(likeImprovement.calls.length, 0);
    } finally {
      likeDb.restore();
    }

    const repeatedDislikeImprovement = makeImprovementStub();
    const repeatedDislikeRow = makeKnowledgeItemRow({ userFeedback: "dislike" });
    const repeatedDislikeService = makeServiceHarness(makeAccessStub(), repeatedDislikeRow, {
      improvement: repeatedDislikeImprovement,
    });
    const repeatedDislikeDb = captureFeedbackTransaction({
      createdFeedbackId: "00000000-0000-0000-0000-000000000702",
    });
    try {
      await repeatedDislikeService.setFeedback(repeatedDislikeRow.id, { rating: "dislike" }, user);
      assert.equal(repeatedDislikeImprovement.calls.length, 0);
    } finally {
      repeatedDislikeDb.restore();
    }
  });

  void it("does not fail feedback submission when immediate improvement enqueue fails", async () => {
    const improvement = makeImprovementStub(new Error("queue unavailable"));
    const row = makeKnowledgeItemRow({ userFeedback: null });
    const service = makeServiceHarness(makeAccessStub(), row, { improvement });
    const { restore } = captureFeedbackTransaction({
      createdFeedbackId: "00000000-0000-0000-0000-000000000703",
    });

    try {
      const result = await service.setFeedback(row.id, { rating: "dislike" }, user);

      assert.equal(result.id, row.id);
      assert.equal(improvement.calls.length, 1);
    } finally {
      restore();
    }
  });
});

function buildListConditionSql(
  query: Parameters<KnowledgeItemService["listByKnowledgeBase"]>[1],
  canManage: boolean,
) {
  const service = makeService(makeAccessStub());
  const condition = (service as unknown as KnowledgeItemListConditionInternals).buildListCondition(
    "00000000-0000-0000-0000-000000000200",
    query,
    canManage,
  );
  return db.select({ id: knowledgeItems.id }).from(knowledgeItems).where(condition).toSQL();
}

async function captureUpdateValues(
  action: () => Promise<KnowledgeItem>,
): Promise<KnowledgeItemUpdateValues> {
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

function makeServiceHarness(
  access: AccessStub,
  row: KnowledgeItemRow,
  options: { improvement?: ImprovementStub } = {},
): KnowledgeItemService {
  const service = makeService(access, options);
  const internals = service as unknown as KnowledgeItemMutationInternals;
  internals.findRow = () => Promise.resolve(row);
  internals.get = () => Promise.resolve(makeKnowledgeItem(row));
  return service;
}

function makeService(
  access: AccessStub,
  options: { improvement?: ImprovementStub } = {},
): KnowledgeItemService {
  return new KnowledgeItemService(
    access as unknown as KnowledgeBaseAccessService,
    makeLlmStub() as unknown as AliyunLlmService,
    makeAnalyticsStub() as unknown as AnalyticsEventService,
    (options.improvement ?? {}) as KnowledgeImprovementService,
  );
}

function captureFeedbackTransaction(options: { createdFeedbackId: string }) {
  const mutableDb = db as unknown as MutableDb;
  const originalTransaction = mutableDb.transaction;
  const inserts: Record<string, unknown>[] = [];

  mutableDb.transaction = async (callback) => {
    const tx: TransactionClient = {
      delete() {
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
      insert() {
        return {
          values(values: Record<string, unknown>) {
            inserts.push(values);
            return {
              returning() {
                return Promise.resolve([{ id: options.createdFeedbackId }]);
              },
            };
          },
        };
      },
      update() {
        return {
          set() {
            return {
              where() {
                return Promise.resolve([]);
              },
            };
          },
        };
      },
    };
    return callback(tx);
  };

  return {
    inserts,
    restore: () => {
      mutableDb.transaction = originalTransaction;
    },
  };
}

function makeImprovementStub(error?: Error): ImprovementStub {
  const calls: string[] = [];
  return {
    calls,
    triggerFromItemFeedback: (feedbackId: string) => {
      calls.push(feedbackId);
      return error === undefined ? Promise.resolve() : Promise.reject(error);
    },
  };
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
