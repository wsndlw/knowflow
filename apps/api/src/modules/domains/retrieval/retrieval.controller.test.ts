import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";

import { NotFoundException } from "@nestjs/common";
import { closeDb, db, knowledgeBaseAdmins, knowledgeBaseMembers, knowledgeBases } from "@knowflow/db";
import type { RetrievalTestResponse } from "@knowflow/shared";
import { sql } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { RetrievalController } from "./retrieval.controller.js";
import type { RetrievalService } from "./retrieval.service.js";

const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000001";
const READONLY_USER_ID = "00000000-0000-4000-8000-000000000004";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000005";
const DEPARTMENT_ID = "00000000-0000-4000-8000-000000000006";

type RetrievalTestInput = Parameters<RetrievalService["testRetrieve"]>[0];

type QueryChain = {
  from: (table: unknown) => QueryChain;
  where: (condition: unknown) => QueryChain;
  limit: (limit: number) => Promise<unknown[]>;
  getSQL: () => ReturnType<typeof sql>;
};

type SelectFn = (selection?: unknown) => QueryChain;

type MutableDb = {
  select: SelectFn;
};

const mutableDb = db as unknown as MutableDb;
const originalSelect = mutableDb.select;

const readonlyUser: AuthenticatedUser = {
  id: READONLY_USER_ID,
  username: "readonly",
  name: "Read Only",
  platformRole: "user",
  departmentId: DEPARTMENT_ID,
};

const adminUser: AuthenticatedUser = {
  ...readonlyUser,
  id: ADMIN_USER_ID,
  username: "kb-admin",
  name: "Knowledge Base Admin",
};

const emptyRetrievalResponse: RetrievalTestResponse = {
  results: [],
  debug: {
    settings: {
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      retrievalMode: "hybrid_rerank",
      topK: 5,
      similarityThreshold: 0.7,
      rerankEnabled: true,
      rerankModel: null,
      rerankTopN: 30,
      rerankKeepN: 10,
      vectorWeight: 0.5,
      ftsWeight: 0.3,
      kiWeight: 0.2,
    },
    performance: {
      vectorRecalled: 0,
      ftsRecalled: 0,
      kiRecalled: 0,
      afterMerge: 0,
      afterRerank: null,
      finalCount: 0,
      timings: {
        embeddingMs: 0,
        vectorMs: 0,
        ftsMs: 0,
        kiMs: 0,
        rerankMs: null,
        totalMs: 0,
      },
    },
  },
};

function installDbPatch(input: {
  canManageKnowledgeBase: boolean;
}): { knowledgeBasePermissionChecks: number } {
  const calls = {
    knowledgeBasePermissionChecks: 0,
  };

  mutableDb.select = () => {
    let selectedTable: unknown;
    const chain: QueryChain = {
      from: (table) => {
        selectedTable = table;
        return chain;
      },
      where: () => chain,
      limit: () => {
        if (selectedTable === knowledgeBases) {
          calls.knowledgeBasePermissionChecks += 1;
          return Promise.resolve(input.canManageKnowledgeBase ? [{ id: KNOWLEDGE_BASE_ID }] : []);
        }
        if (selectedTable === knowledgeBaseAdmins || selectedTable === knowledgeBaseMembers) {
          return Promise.resolve(input.canManageKnowledgeBase ? [{ id: "membership" }] : []);
        }
        return Promise.resolve([]);
      },
      getSQL: () => sql`select 1`,
    };
    return chain;
  };

  return calls;
}

function restoreDb(): void {
  mutableDb.select = originalSelect;
}

function buildController(retrievalService: RetrievalService): RetrievalController {
  return new RetrievalController(retrievalService, new KnowledgeBaseAccessService());
}

void describe("retrieval test permissions", () => {
  afterEach(() => {
    restoreDb();
  });

  after(async () => {
    await closeDb();
  });

  void it("rejects non-managers through POST /knowledge-bases/:id/retrieval-test", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: false });
    let retrievalCalled = false;
    const retrievalService = {
      testRetrieve: () => {
        retrievalCalled = true;
        return Promise.resolve(emptyRetrievalResponse);
      },
    } as unknown as RetrievalService;
    const controller = buildController(retrievalService);

    await assert.rejects(
      () =>
        controller.testRetrieve(
          { id: KNOWLEDGE_BASE_ID },
          { query: "policy" },
          { headers: {}, user: readonlyUser },
        ),
      NotFoundException,
    );
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.equal(retrievalCalled, false);
  });

  void it("allows managers through POST /knowledge-bases/:id/retrieval-test", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: true });
    let receivedInput: RetrievalTestInput | undefined;
    const retrievalService = {
      testRetrieve: (input: RetrievalTestInput) => {
        receivedInput = input;
        return Promise.resolve(emptyRetrievalResponse);
      },
    } as unknown as RetrievalService;
    const controller = buildController(retrievalService);

    const response = await controller.testRetrieve(
      { id: KNOWLEDGE_BASE_ID },
      { query: "policy" },
      { headers: {}, user: adminUser },
    );

    assert.deepEqual(response, { ok: true, data: emptyRetrievalResponse });
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.ok(receivedInput);
    assert.equal(receivedInput.knowledgeBaseId, KNOWLEDGE_BASE_ID);
    assert.equal(receivedInput.canManage, true);
  });
});
