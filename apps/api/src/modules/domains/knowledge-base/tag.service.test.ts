import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";

import { ForbiddenException } from "@nestjs/common";
import {
  closeDb,
  db,
  documentTags,
  documents,
  knowledgeBaseAdmins,
  knowledgeBaseMembers,
  knowledgeBases,
  knowledgeItemTags,
  knowledgeItems,
} from "@knowflow/db";
import { sql } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { TagController } from "./tag.controller.js";
import { TagService } from "./tag.service.js";

const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000002";
const KNOWLEDGE_ITEM_ID = "00000000-0000-4000-8000-000000000003";
const READONLY_USER_ID = "00000000-0000-4000-8000-000000000004";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000005";
const DEPARTMENT_ID = "00000000-0000-4000-8000-000000000006";

type QueryChain = {
  from: (table: unknown) => QueryChain;
  where: (condition: unknown) => QueryChain;
  innerJoin: (table: unknown, condition: unknown) => QueryChain;
  limit: (limit: number) => Promise<unknown[]>;
  orderBy: (...columns: unknown[]) => Promise<unknown[]>;
  getSQL: () => ReturnType<typeof sql>;
};

type SelectFn = (selection?: unknown) => QueryChain;

type TransactionClient = {
  delete: (table: unknown) => {
    where: (condition: unknown) => Promise<void>;
  };
  insert: (table: unknown) => {
    values: (values: unknown) => Promise<void>;
  };
};

type TransactionFn = <T>(operation: (tx: TransactionClient) => Promise<T>) => Promise<T>;

type MutableDb = {
  select: SelectFn;
  transaction: TransactionFn;
};

const mutableDb = db as unknown as MutableDb;
const originalDb = {
  select: mutableDb.select,
  transaction: mutableDb.transaction,
};

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

function installDbPatch(input: {
  canManageKnowledgeBase: boolean;
}): { transactions: number; deletes: number; knowledgeBasePermissionChecks: number } {
  const calls = {
    transactions: 0,
    deletes: 0,
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
      innerJoin: () => chain,
      limit: () => {
        if (selectedTable === documents) {
          return Promise.resolve([{ knowledgeBaseId: KNOWLEDGE_BASE_ID }]);
        }
        if (selectedTable === knowledgeItems) {
          return Promise.resolve([{ knowledgeBaseId: KNOWLEDGE_BASE_ID }]);
        }
        if (selectedTable === knowledgeBases) {
          calls.knowledgeBasePermissionChecks += 1;
          return Promise.resolve(input.canManageKnowledgeBase ? [{ id: KNOWLEDGE_BASE_ID }] : []);
        }
        if (selectedTable === knowledgeBaseAdmins || selectedTable === knowledgeBaseMembers) {
          return Promise.resolve(input.canManageKnowledgeBase ? [{ id: "membership" }] : []);
        }
        return Promise.resolve([]);
      },
      orderBy: () => {
        if (selectedTable === documentTags || selectedTable === knowledgeItemTags) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      },
      getSQL: () => sql`select 1`,
    };
    return chain;
  };

  mutableDb.transaction = async (operation) => {
    calls.transactions += 1;
    return operation({
      delete: () => ({
        where: () => {
          calls.deletes += 1;
          return Promise.resolve();
        },
      }),
      insert: () => ({
        values: () => Promise.resolve(),
      }),
    });
  };

  return calls;
}

function restoreDb(): void {
  mutableDb.select = originalDb.select;
  mutableDb.transaction = originalDb.transaction;
}

function buildController(): TagController {
  const accessService = new KnowledgeBaseAccessService();
  return new TagController(new TagService(accessService));
}

function requestFor(user: AuthenticatedUser): AuthenticatedRequest {
  return {
    headers: {},
    user,
  };
}

void describe("tag replacement permissions", () => {
  afterEach(() => {
    restoreDb();
  });

  after(async () => {
    await closeDb();
  });

  void it("rejects read-only members through PUT /documents/:id/tags", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: false });
    const controller = buildController();

    await assert.rejects(
      () =>
        controller.replaceDocumentTags(
          { id: DOCUMENT_ID },
          { tagIds: [] },
          requestFor(readonlyUser),
        ),
      ForbiddenException,
    );
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.equal(calls.transactions, 0);
  });

  void it("allows knowledge base admins through PUT /documents/:id/tags", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: true });
    const controller = buildController();

    const response = await controller.replaceDocumentTags(
      { id: DOCUMENT_ID },
      { tagIds: [] },
      requestFor(adminUser),
    );

    assert.deepEqual(response, { ok: true, data: { items: [] } });
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.deletes, 1);
  });

  void it("rejects read-only members through PUT /knowledge-items/:id/tags", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: false });
    const controller = buildController();

    await assert.rejects(
      () =>
        controller.replaceKnowledgeItemTags(
          { id: KNOWLEDGE_ITEM_ID },
          { tagIds: [] },
          requestFor(readonlyUser),
        ),
      ForbiddenException,
    );
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.equal(calls.transactions, 0);
  });

  void it("allows knowledge base admins through PUT /knowledge-items/:id/tags", async () => {
    const calls = installDbPatch({ canManageKnowledgeBase: true });
    const controller = buildController();

    const response = await controller.replaceKnowledgeItemTags(
      { id: KNOWLEDGE_ITEM_ID },
      { tagIds: [] },
      requestFor(adminUser),
    );

    assert.deepEqual(response, { ok: true, data: { items: [] } });
    assert.equal(calls.knowledgeBasePermissionChecks, 1);
    assert.equal(calls.transactions, 1);
    assert.equal(calls.deletes, 1);
  });
});
