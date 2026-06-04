import assert from "node:assert/strict";
import { after, afterEach, describe, it } from "node:test";

import { ForbiddenException } from "@nestjs/common";
import { closeDb, db } from "@knowflow/db";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "./knowledge-base-access.service.js";
import { TagService } from "./tag.service.js";

const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000001";
const DOCUMENT_ID = "00000000-0000-4000-8000-000000000002";
const KNOWLEDGE_ITEM_ID = "00000000-0000-4000-8000-000000000003";
const USER_ID = "00000000-0000-4000-8000-000000000004";
const DEPARTMENT_ID = "00000000-0000-4000-8000-000000000005";

type SelectLimitChain = {
  limit: (limit: number) => Promise<unknown[]>;
};

type SelectJoinChain = {
  where: (condition: unknown) => {
    orderBy: (...columns: unknown[]) => Promise<unknown[]>;
  };
};

type SelectFromChain = {
  where: (condition: unknown) => SelectLimitChain;
  innerJoin: (table: unknown, condition: unknown) => SelectJoinChain;
};

type SelectFn = (selection?: unknown) => {
  from: (table: unknown) => SelectFromChain;
};

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
  id: USER_ID,
  username: "readonly",
  name: "Read Only",
  platformRole: "user",
  departmentId: DEPARTMENT_ID,
};

const adminUser: AuthenticatedUser = {
  ...readonlyUser,
  username: "admin",
  name: "Knowledge Base Admin",
};

function installDbPatch(): { transactions: number; deletes: number; inserts: number } {
  const calls = {
    transactions: 0,
    deletes: 0,
    inserts: 0,
  };

  mutableDb.select = () => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve([{ knowledgeBaseId: KNOWLEDGE_BASE_ID }]),
      }),
      innerJoin: () => ({
        where: () => ({
          orderBy: () => Promise.resolve([]),
        }),
      }),
    }),
  });

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
        values: () => {
          calls.inserts += 1;
          return Promise.resolve();
        },
      }),
    });
  };

  return calls;
}

function restoreDb(): void {
  mutableDb.select = originalDb.select;
  mutableDb.transaction = originalDb.transaction;
}

function buildAccessService(canManage: boolean): KnowledgeBaseAccessService {
  return {
    buildAccessCondition: () => undefined,
    buildManageCondition: () => undefined,
    canAccess: () => Promise.resolve(true),
    canManage: () => Promise.resolve(canManage),
  };
}

void describe("tag replacement permissions", () => {
  afterEach(() => {
    restoreDb();
  });

  after(async () => {
    await closeDb();
  });

  void it("rejects read-only members replacing document tags", async () => {
    const calls = installDbPatch();
    const service = new TagService(buildAccessService(false));

    await assert.rejects(
      () => service.replaceDocumentTags(DOCUMENT_ID, { tagIds: [] }, readonlyUser),
      ForbiddenException,
    );
    assert.equal(calls.transactions, 0);
  });

  void it("allows knowledge base admins replacing document tags", async () => {
    const calls = installDbPatch();
    const service = new TagService(buildAccessService(true));

    const response = await service.replaceDocumentTags(DOCUMENT_ID, { tagIds: [] }, adminUser);

    assert.deepEqual(response, { items: [] });
    assert.equal(calls.transactions, 1);
    assert.equal(calls.deletes, 1);
  });

  void it("rejects read-only members replacing knowledge item tags", async () => {
    const calls = installDbPatch();
    const service = new TagService(buildAccessService(false));

    await assert.rejects(
      () =>
        service.replaceKnowledgeItemTags(KNOWLEDGE_ITEM_ID, { tagIds: [] }, readonlyUser),
      ForbiddenException,
    );
    assert.equal(calls.transactions, 0);
  });

  void it("allows knowledge base admins replacing knowledge item tags", async () => {
    const calls = installDbPatch();
    const service = new TagService(buildAccessService(true));

    const response = await service.replaceKnowledgeItemTags(
      KNOWLEDGE_ITEM_ID,
      { tagIds: [] },
      adminUser,
    );

    assert.deepEqual(response, { items: [] });
    assert.equal(calls.transactions, 1);
    assert.equal(calls.deletes, 1);
  });
});
