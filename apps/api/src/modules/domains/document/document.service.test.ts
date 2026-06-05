import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ForbiddenException } from "@nestjs/common";
import { db, documents, knowledgeItems } from "@knowflow/db";
import type { DocumentListQuery } from "@knowflow/shared";
import { documentListQuerySchema } from "@knowflow/shared";
import type { SQL } from "drizzle-orm";

import type { AnalyticsEventService } from "../analytics/analytics-event.service.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { DocumentService } from "./document.service.js";

type AccessStub = Pick<KnowledgeBaseAccessService, "canAccess" | "canManage">;
type AnalyticsStub = Pick<AnalyticsEventService, "recordSafe">;

type DocumentServiceInternals = {
  buildListCondition: (knowledgeBaseId: string, query: DocumentListQuery) => SQL | undefined;
  findRow: (id: string) => Promise<DocumentRow | undefined>;
  fetchTagsByDocumentIds: (documentIds: string[]) => Promise<Map<string, []>>;
  countChunks: (documentId: string) => Promise<{ parentChunkCount: number; childChunkCount: number }>;
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type MutableDb = {
  transaction: <T>(callback: (tx: TransactionClient) => Promise<T>) => Promise<T>;
};

type TransactionClient = {
  update: (table: unknown) => UpdateChain;
};

type UpdateRecord = {
  table: unknown;
  values: Record<string, unknown>;
  condition?: unknown;
};

type DocumentRow = {
  id: string;
  knowledgeBaseId: string;
  title: string;
  sourceType: "pdf";
  sourceUri: string | null;
  fileId: string | null;
  fileType: string | null;
  fileSize: number | null;
  uploaderId: string;
  uploaderName: string;
  processStatus: "completed";
  parseStatus: "completed";
  chunkStatus: "completed";
  embeddingStatus: "completed";
  enabled: boolean;
  metadata: unknown;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const knowledgeBaseId = "00000000-0000-0000-0000-000000000100";
const documentId = "00000000-0000-0000-0000-000000000200";

const user: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

void describe("DocumentService archive semantics", () => {
  void it("archives a document by flipping enabled to false", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeService(access);
    const internals = service as unknown as DocumentServiceInternals;
    let findCalls = 0;
    internals.findRow = () => {
      findCalls += 1;
      return Promise.resolve(makeDocumentRow({ enabled: findCalls >= 2 ? false : true }));
    };
    internals.fetchTagsByDocumentIds = () => Promise.resolve(new Map<string, []>());
    internals.countChunks = () => Promise.resolve({ parentChunkCount: 0, childChunkCount: 0 });

    const { updates, restore } = captureTransactionUpdates();
    try {
      const result = await service.archive(documentId, user);
      const documentUpdate = updates.find((update) => update.table === documents);
      const itemUpdate = updates.find((update) => update.table === knowledgeItems);

      assert.equal(access.canManageCalls, 1);
      assert.ok(documentUpdate);
      assert.ok(itemUpdate);
      assert.equal(documentUpdate.values["enabled"], false);
      assert.equal(
        Object.prototype.toString.call(documentUpdate.values["updatedAt"]),
        "[object Date]",
      );
      assert.equal(itemUpdate.values["status"], "archived");
      assert.equal(itemUpdate.values["enabled"], false);
      assert.equal(Object.prototype.toString.call(itemUpdate.values["updatedAt"]), "[object Date]");
      assert.equal(result.enabled, false);
    } finally {
      restore();
    }
  });

  void it("restores a document by flipping enabled to true", async () => {
    const access = makeAccessStub({ canManage: true });
    const service = makeService(access);
    const internals = service as unknown as DocumentServiceInternals;
    let findCalls = 0;
    internals.findRow = () => {
      findCalls += 1;
      return Promise.resolve(makeDocumentRow({ enabled: findCalls >= 2 ? true : false }));
    };
    internals.fetchTagsByDocumentIds = () => Promise.resolve(new Map<string, []>());
    internals.countChunks = () => Promise.resolve({ parentChunkCount: 0, childChunkCount: 0 });

    const { updates, restore } = captureTransactionUpdates();
    try {
      const result = await service.restore(documentId, user);
      const documentUpdate = updates.find((update) => update.table === documents);
      const itemUpdate = updates.find((update) => update.table === knowledgeItems);

      assert.equal(access.canManageCalls, 1);
      assert.equal(documentUpdate?.values["enabled"], true);
      assert.equal(itemUpdate, undefined);
      assert.equal(result.enabled, true);
    } finally {
      restore();
    }
  });

  void it("requires manage permission to archive documents", async () => {
    const access = makeAccessStub({ canManage: false });
    const service = makeService(access);
    const internals = service as unknown as DocumentServiceInternals;
    internals.findRow = () => Promise.resolve(makeDocumentRow());

    await assert.rejects(() => service.archive(documentId, user), ForbiddenException);
    assert.equal(access.canManageCalls, 1);
  });

  void it("excludes archived documents from list results by default", () => {
    const { params } = buildListSql({});

    assert.equal(params.includes(knowledgeBaseId), true);
    assert.equal(params.includes(true), true);
  });

  void it("supports archived and enabled list filters", () => {
    const archived = buildListSql({ archived: "true" });
    const enabled = buildListSql({ enabled: "false" });
    const archivedWins = buildListSql({ archived: "false", enabled: "false" });

    assert.equal(archived.params.includes(false), true);
    assert.equal(enabled.params.includes(false), true);
    assert.equal(archivedWins.params.includes(true), true);
    assert.equal(archivedWins.params.includes(false), false);
  });
});

function buildListSql(input: Record<string, unknown>) {
  const service = makeService(makeAccessStub());
  const condition = (service as unknown as DocumentServiceInternals).buildListCondition(
    knowledgeBaseId,
    documentListQuerySchema.parse(input),
  );
  return db.select({ id: documents.id }).from(documents).where(condition).toSQL();
}

function captureTransactionUpdates() {
  const mutableDb = db as unknown as MutableDb;
  const originalTransaction = mutableDb.transaction;
  const updates: UpdateRecord[] = [];

  const tx: TransactionClient = {
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          const update: UpdateRecord = { table, values };
          updates.push(update);
          return {
            where(condition: unknown) {
              update.condition = condition;
              return Promise.resolve([]);
            },
          };
        },
      };
    },
  };

  mutableDb.transaction = (callback) => callback(tx);

  return {
    updates,
    restore: () => {
      mutableDb.transaction = originalTransaction;
    },
  };
}

function makeService(
  access: AccessStub,
  analytics: AnalyticsStub = makeAnalyticsStub(),
): DocumentService {
  return new DocumentService(
    access as unknown as KnowledgeBaseAccessService,
    analytics as unknown as AnalyticsEventService,
  );
}

function makeAccessStub(options: { canAccess?: boolean; canManage?: boolean } = {}) {
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

function makeAnalyticsStub() {
  return {
    recordSafe() {
      return Promise.resolve();
    },
  };
}

function makeDocumentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: documentId,
    knowledgeBaseId,
    title: "Employee handbook",
    sourceType: "pdf",
    sourceUri: "documents/handbook.pdf",
    fileId: null,
    fileType: "application/pdf",
    fileSize: 1024,
    uploaderId: user.id,
    uploaderName: user.name,
    processStatus: "completed",
    parseStatus: "completed",
    chunkStatus: "completed",
    embeddingStatus: "completed",
    enabled: true,
    metadata: {},
    errorMessage: null,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    updatedAt: new Date("2026-06-04T00:00:00.000Z"),
    ...overrides,
  };
}
