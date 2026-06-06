import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { db } from "@knowflow/db";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { DepartmentService } from "./department.service.js";

type InsertChain = {
  values: (values: Record<string, unknown>) => {
    returning: () => Promise<unknown[]>;
  };
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type DeleteChain = {
  where: (condition: unknown) => Promise<unknown[]>;
};

type MutableDb = {
  insert: (table: unknown) => InsertChain;
  update: (table: unknown) => UpdateChain;
  delete: (table: unknown) => DeleteChain;
};

type AdminUserRow = {
  id: string;
  username: string;
  name: string;
  platformRole: "super_admin" | "department_admin" | "user";
  status: "active" | "disabled";
  departmentId: string;
  departmentName: string;
};

type ServiceOverrides = {
  ensureDepartmentNameAvailable?: (name: string, excludeId?: string) => Promise<void>;
  ensureDepartmentExists?: (id: string) => Promise<void>;
  findDepartment?: (id: string) => Promise<unknown>;
  findUser?: (id: string) => Promise<AdminUserRow | undefined>;
  countDepartmentReferences?: (id: string) => Promise<{
    userCount: number;
    knowledgeBaseCount: number;
    adminCount: number;
  }>;
};

const superAdmin: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  name: "Admin",
  platformRole: "super_admin",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

const departmentAdmin: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "dept.admin",
  name: "Dept Admin",
  platformRole: "department_admin",
  departmentId: "00000000-0000-0000-0000-000000000020",
};

const normalUser: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000003",
  username: "user",
  name: "User",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000020",
};

void describe("DepartmentService", () => {
  void it("creates departments for super admins", async () => {
    const service = makeService({
      ensureDepartmentNameAvailable: () => Promise.resolve(),
    });
    const mutableDb = db as unknown as MutableDb;
    const originalInsert = mutableDb.insert;
    let insertedName: unknown;

    mutableDb.insert = () => ({
      values(values: Record<string, unknown>) {
        insertedName = values["name"];
        return {
          returning() {
            return Promise.resolve([
              {
                id: "00000000-0000-0000-0000-000000000100",
                name: values["name"],
                parentId: null,
                createdAt: new Date("2026-06-04T00:00:00.000Z"),
                updatedAt: new Date("2026-06-04T00:00:00.000Z"),
              },
            ]);
          },
        };
      },
    });

    try {
      const result = await service.createDepartment({ name: "Engineering" }, superAdmin);

      assert.equal(insertedName, "Engineering");
      assert.equal(result.name, "Engineering");
      assert.equal(result.createdAt, "2026-06-04T00:00:00.000Z");
    } finally {
      mutableDb.insert = originalInsert;
    }
  });

  void it("rejects department creation by non-super admins", async () => {
    const service = new DepartmentService();

    await assert.rejects(
      () => service.createDepartment({ name: "Engineering" }, departmentAdmin),
      ForbiddenException,
    );
    await assert.rejects(
      () => service.createDepartment({ name: "Engineering" }, normalUser),
      ForbiddenException,
    );
  });

  void it("rejects deleting departments that still have references", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      countDepartmentReferences: () =>
        Promise.resolve({ userCount: 1, knowledgeBaseCount: 0, adminCount: 0 }),
    });

    await assert.rejects(
      () => service.deleteDepartment("00000000-0000-0000-0000-000000000100", superAdmin),
      BadRequestException,
    );
  });

  void it("deletes unreferenced departments for super admins", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      countDepartmentReferences: () =>
        Promise.resolve({ userCount: 0, knowledgeBaseCount: 0, adminCount: 0 }),
    });
    const mutableDb = db as unknown as MutableDb;
    const originalDelete = mutableDb.delete;
    let deleted = false;

    mutableDb.delete = () => ({
      where() {
        deleted = true;
        return Promise.resolve([]);
      },
    });

    try {
      await service.deleteDepartment("00000000-0000-0000-0000-000000000100", superAdmin);
      assert.equal(deleted, true);
    } finally {
      mutableDb.delete = originalDelete;
    }
  });

  void it("adds a member by assigning the user's department", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      findUser: () => Promise.resolve(makeUserRow({ departmentId: superAdmin.departmentId })),
    });
    const { updates, restore } = captureUserUpdates();

    try {
      await service.addMember(
        "00000000-0000-0000-0000-000000000020",
        "00000000-0000-0000-0000-000000000030",
        superAdmin,
      );

      assert.equal(updates.length, 1);
      assert.equal(updates[0]?.["departmentId"], "00000000-0000-0000-0000-000000000020");
    } finally {
      restore();
    }
  });

  void it("assigns a user's department and returns the updated user", async () => {
    let lookupCount = 0;
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      findUser: () => {
        lookupCount += 1;
        return Promise.resolve(
          makeUserRow({
            departmentId:
              lookupCount === 1
                ? "00000000-0000-0000-0000-000000000010"
                : "00000000-0000-0000-0000-000000000020",
            departmentName: lookupCount === 1 ? "Default" : "Engineering",
          }),
        );
      },
    });
    const { updates, restore } = captureUserUpdates();

    try {
      const result = await service.assignUserDepartment(
        "00000000-0000-0000-0000-000000000030",
        { departmentId: "00000000-0000-0000-0000-000000000020" },
        superAdmin,
      );

      assert.equal(updates.length, 1);
      assert.equal(result.departmentId, "00000000-0000-0000-0000-000000000020");
      assert.equal(result.departmentName, "Engineering");
    } finally {
      restore();
    }
  });

  void it("lets department admins add users from other departments into their own", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      // 目标用户当前属于其他部门（...030），部门管理员管辖的是 ...020。
      findUser: () =>
        Promise.resolve(
          makeUserRow({ departmentId: "00000000-0000-0000-0000-000000000030" }),
        ),
    });
    const { updates, restore } = captureUserUpdates();

    try {
      await service.addMember(
        departmentAdmin.departmentId,
        "00000000-0000-0000-0000-000000000040",
        departmentAdmin,
      );

      assert.equal(updates.length, 1);
      assert.equal(updates[0]?.["departmentId"], departmentAdmin.departmentId);
    } finally {
      restore();
    }
  });

  void it("rejects department admins managing other departments", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      findUser: () => Promise.resolve(makeUserRow({ departmentId: departmentAdmin.departmentId })),
    });

    await assert.rejects(
      () =>
        service.addMember(
          "00000000-0000-0000-0000-000000000030",
          "00000000-0000-0000-0000-000000000040",
          departmentAdmin,
        ),
      ForbiddenException,
    );
  });
});

function makeService(overrides: ServiceOverrides = {}): DepartmentService {
  const service = new DepartmentService();
  Object.assign(service as object, overrides);
  return service;
}

function makeUserRow(overrides: Partial<AdminUserRow> = {}): AdminUserRow {
  return {
    id: "00000000-0000-0000-0000-000000000030",
    username: "member",
    name: "Member",
    platformRole: "user",
    status: "active",
    departmentId: "00000000-0000-0000-0000-000000000010",
    departmentName: "Default",
    ...overrides,
  };
}

function captureUserUpdates(): {
  updates: Record<string, unknown>[];
  restore: () => void;
} {
  const mutableDb = db as unknown as MutableDb;
  const originalUpdate = mutableDb.update;
  const updates: Record<string, unknown>[] = [];

  mutableDb.update = () => ({
    set(values: Record<string, unknown>) {
      updates.push(values);
      return {
        where() {
          return Promise.resolve([]);
        },
      };
    },
  });

  return {
    updates,
    restore() {
      mutableDb.update = originalUpdate;
    },
  };
}
