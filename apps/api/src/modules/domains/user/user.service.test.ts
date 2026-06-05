import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { db, sessions, users } from "@knowflow/db";
import type { UserOption } from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { UserService } from "./user.service.js";

type InsertChain = {
  values: (values: Record<string, unknown>) => {
    returning: (fields?: unknown) => Promise<unknown[]>;
  };
};

type UpdateChain = {
  set: (values: Record<string, unknown>) => {
    where: (condition: unknown) => Promise<unknown[]>;
  };
};

type MutableDb = {
  insert: (table: unknown) => InsertChain;
  update: (table: unknown) => UpdateChain;
};

type ServiceOverrides = {
  ensureDepartmentExists?: (id: string) => Promise<void>;
  ensureUsernameAvailable?: (username: string) => Promise<void>;
  ensureUserExists?: (id: string) => Promise<void>;
  getUserOption?: (id: string) => Promise<UserOption>;
};

const superAdmin: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "admin",
  name: "Admin",
  platformRole: "super_admin",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

const normalUser: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "user",
  name: "User",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

void describe("UserService", () => {
  void it("creates users with duplicate checks, hashed password, and active status", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      ensureUsernameAvailable: () => Promise.resolve(),
      getUserOption: () => Promise.resolve(makeUserOption()),
    });
    const mutableDb = db as unknown as MutableDb;
    const originalInsert = mutableDb.insert;
    let insertedValues: Record<string, unknown> | undefined;

    mutableDb.insert = () => ({
      values(values: Record<string, unknown>) {
        insertedValues = values;
        return {
          returning() {
            return Promise.resolve([{ id: "00000000-0000-0000-0000-000000000030" }]);
          },
        };
      },
    });

    try {
      const result = await service.createUser(
        {
          username: "new.user",
          name: "New User",
          password: "password-123",
          departmentId: "00000000-0000-0000-0000-000000000010",
          platformRole: "user",
        },
        superAdmin,
      );

      assert.ok(insertedValues);
      assert.equal(insertedValues["username"], "new.user");
      assert.equal(insertedValues["status"], "active");
      assert.equal(insertedValues["passwordHash"] !== "password-123", true);
      assert.equal(String(insertedValues["passwordHash"]).startsWith("scrypt$"), true);
      assert.equal(result.status, "active");
    } finally {
      mutableDb.insert = originalInsert;
    }
  });

  void it("rejects duplicate usernames when creating users", async () => {
    const service = makeService({
      ensureDepartmentExists: () => Promise.resolve(),
      ensureUsernameAvailable: () =>
        Promise.reject(new BadRequestException("Username already exists")),
    });

    await assert.rejects(
      () =>
        service.createUser(
          {
            username: "existing",
            name: "Existing",
            password: "password-123",
            departmentId: "00000000-0000-0000-0000-000000000010",
            platformRole: "user",
          },
          superAdmin,
        ),
      BadRequestException,
    );
  });

  void it("updates user roles", async () => {
    const service = makeService({
      ensureUserExists: () => Promise.resolve(),
      getUserOption: () => Promise.resolve(makeUserOption({ platformRole: "department_admin" })),
    });
    const { updates, restore } = captureUpdates();

    try {
      const result = await service.updateRole(
        "00000000-0000-0000-0000-000000000030",
        { platformRole: "department_admin" },
        superAdmin,
      );

      assert.equal(updates.length, 1);
      const roleUpdate = updates[0];
      assert.ok(roleUpdate);
      assert.equal(roleUpdate.values["platformRole"], "department_admin");
      assert.equal(result.platformRole, "department_admin");
    } finally {
      restore();
    }
  });

  void it("rejects self role updates", async () => {
    const service = makeService({
      ensureUserExists: () => Promise.resolve(),
    });

    await assert.rejects(
      () => service.updateRole(superAdmin.id, { platformRole: "user" }, superAdmin),
      BadRequestException,
    );
  });

  void it("resets passwords and revokes user sessions", async () => {
    const service = makeService({
      ensureUserExists: () => Promise.resolve(),
    });
    const { updates, restore } = captureUpdates();

    try {
      await service.resetPassword(
        "00000000-0000-0000-0000-000000000030",
        { password: "new-password-123" },
        superAdmin,
      );

      const userUpdate = updates.find((entry) => entry.table === users);
      const sessionUpdate = updates.find((entry) => entry.table === sessions);
      assert.equal(String(userUpdate?.values["passwordHash"]).startsWith("scrypt$"), true);
      assert.equal(userUpdate?.values["passwordHash"] !== "new-password-123", true);
      assert.equal(sessionUpdate?.values["revokedAt"] instanceof Date, true);
    } finally {
      restore();
    }
  });

  void it("disables users, revokes sessions, and prevents self-disable", async () => {
    const service = makeService({
      ensureUserExists: () => Promise.resolve(),
      getUserOption: () => Promise.resolve(makeUserOption({ status: "disabled" })),
    });
    const { updates, restore } = captureUpdates();

    try {
      const result = await service.disableUser(
        "00000000-0000-0000-0000-000000000030",
        superAdmin,
      );

      const userUpdate = updates.find((entry) => entry.table === users);
      const sessionUpdate = updates.find((entry) => entry.table === sessions);
      assert.equal(userUpdate?.values["status"], "disabled");
      assert.equal(sessionUpdate?.values["revokedAt"] instanceof Date, true);
      assert.equal(result.status, "disabled");

      await assert.rejects(
        () => service.disableUser(superAdmin.id, superAdmin),
        BadRequestException,
      );
    } finally {
      restore();
    }
  });

  void it("enables users without revoking sessions", async () => {
    const service = makeService({
      ensureUserExists: () => Promise.resolve(),
      getUserOption: () => Promise.resolve(makeUserOption({ status: "active" })),
    });
    const { updates, restore } = captureUpdates();

    try {
      const result = await service.enableUser(
        "00000000-0000-0000-0000-000000000030",
        superAdmin,
      );

      assert.equal(updates.length, 1);
      const userUpdate = updates[0];
      assert.ok(userUpdate);
      assert.equal(userUpdate.table, users);
      assert.equal(userUpdate.values["status"], "active");
      assert.equal(result.status, "active");
    } finally {
      restore();
    }
  });

  void it("rejects every user management action by non-super admins", async () => {
    const service = new UserService();
    const targetUserId = "00000000-0000-0000-0000-000000000030";
    const cases: { name: string; call: () => Promise<unknown> }[] = [
      {
        name: "createUser",
        call: () =>
          service.createUser(
            {
              username: "new.user",
              name: "New User",
              password: "password-123",
              departmentId: "00000000-0000-0000-0000-000000000010",
              platformRole: "user",
            },
            normalUser,
          ),
      },
      {
        name: "updateRole",
        call: () => service.updateRole(targetUserId, { platformRole: "department_admin" }, normalUser),
      },
      {
        name: "resetPassword",
        call: () => service.resetPassword(targetUserId, { password: "new-password-123" }, normalUser),
      },
      {
        name: "disableUser",
        call: () => service.disableUser(targetUserId, normalUser),
      },
      {
        name: "enableUser",
        call: () => service.enableUser(targetUserId, normalUser),
      },
    ];

    for (const item of cases) {
      await assert.rejects(item.call, ForbiddenException, item.name);
    }
  });
});

function makeService(overrides: ServiceOverrides = {}): UserService {
  const service = new UserService();
  Object.assign(service as object, overrides);
  return service;
}

function makeUserOption(overrides: Partial<UserOption> = {}): UserOption {
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

function captureUpdates(): {
  updates: { table: unknown; values: Record<string, unknown> }[];
  restore: () => void;
} {
  const mutableDb = db as unknown as MutableDb;
  const originalUpdate = mutableDb.update;
  const updates: { table: unknown; values: Record<string, unknown> }[] = [];

  mutableDb.update = (table: unknown) => ({
    set(values: Record<string, unknown>) {
      updates.push({ table, values });
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
