import "reflect-metadata";

import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PermissionGuard } from "../../../shared/guards/permission.guard.js";
import { UserController } from "./user.controller.js";

type UserControllerMethod =
  | "createUser"
  | "updateRole"
  | "resetPassword"
  | "disableUser"
  | "enableUser";

const normalUser: AuthenticatedUser = {
  id: "00000000-0000-0000-0000-000000000002",
  username: "user",
  name: "User",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

const endpointMethods: UserControllerMethod[] = [
  "createUser",
  "updateRole",
  "resetPassword",
  "disableUser",
  "enableUser",
];

void describe("UserController permissions", () => {
  const guard = new PermissionGuard(new Reflector());

  for (const method of endpointMethods) {
    void it(`rejects non-super admins for ${method}`, () => {
      assert.throws(() => guard.canActivate(contextFor(method, normalUser)), ForbiddenException);
    });
  }
});

function contextFor(method: UserControllerMethod, user: AuthenticatedUser): ExecutionContext {
  return {
    getHandler(): unknown {
      return UserController.prototype[method];
    },
    getClass(): unknown {
      return UserController;
    },
    switchToHttp() {
      return {
        getRequest() {
          return { user };
        },
      };
    },
  } as ExecutionContext;
}
