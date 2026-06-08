import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { db, departments, hashPassword, sessions, users } from "@knowflow/db";
import type {
  CreateUserRequest,
  ResetUserPasswordRequest,
  UpdateUserRoleRequest,
  UserOption,
} from "@knowflow/shared";
import { and, eq, isNull } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";

type UserOptionRow = {
  id: string;
  username: string;
  name: string;
  platformRole: UserOption["platformRole"];
  status: UserOption["status"];
  departmentId: string;
  departmentName: string;
};

@Injectable()
export class UserService {
  async createUser(input: CreateUserRequest, user: AuthenticatedUser): Promise<UserOption> {
    this.ensureSuperAdmin(user);
    await this.ensureDepartmentExists(input.departmentId);
    await this.ensureUsernameAvailable(input.username);

    const [created] = await db
      .insert(users)
      .values({
        username: input.username,
        passwordHash: hashPassword(input.password),
        name: input.name,
        departmentId: input.departmentId,
        platformRole: input.platformRole,
        status: "active",
      })
      .returning({ id: users.id });
    if (created === undefined) {
      throw new BadRequestException("创建用户失败");
    }

    return this.getUserOption(created.id);
  }

  async updateRole(
    id: string,
    input: UpdateUserRoleRequest,
    user: AuthenticatedUser,
  ): Promise<UserOption> {
    this.ensureSuperAdmin(user);
    if (id === user.id) {
      throw new BadRequestException("不能修改自己的角色");
    }
    await this.ensureUserExists(id);

    await db
      .update(users)
      .set({ platformRole: input.platformRole, updatedAt: new Date() })
      .where(eq(users.id, id));

    return this.getUserOption(id);
  }

  async resetPassword(
    id: string,
    input: ResetUserPasswordRequest,
    user: AuthenticatedUser,
  ): Promise<void> {
    this.ensureSuperAdmin(user);
    await this.ensureUserExists(id);

    await db
      .update(users)
      .set({ passwordHash: hashPassword(input.password), updatedAt: new Date() })
      .where(eq(users.id, id));
    await this.revokeUserSessions(id);
  }

  async disableUser(id: string, user: AuthenticatedUser): Promise<UserOption> {
    this.ensureSuperAdmin(user);
    if (id === user.id) {
      throw new BadRequestException("不能停用自己的账号");
    }
    await this.ensureUserExists(id);

    await db
      .update(users)
      .set({ status: "disabled", updatedAt: new Date() })
      .where(eq(users.id, id));
    await this.revokeUserSessions(id);

    return this.getUserOption(id);
  }

  async enableUser(id: string, user: AuthenticatedUser): Promise<UserOption> {
    this.ensureSuperAdmin(user);
    await this.ensureUserExists(id);

    await db
      .update(users)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(users.id, id));

    return this.getUserOption(id);
  }

  private ensureSuperAdmin(user: AuthenticatedUser): void {
    if (user.platformRole !== "super_admin") {
      throw new ForbiddenException("仅超级管理员可管理用户");
    }
  }

  private async ensureDepartmentExists(id: string): Promise<void> {
    const department = await db.query.departments.findFirst({
      where: eq(departments.id, id),
      columns: { id: true },
    });
    if (department === undefined) {
      throw new NotFoundException("未找到部门");
    }
  }

  private async ensureUsernameAvailable(username: string): Promise<void> {
    const existing = await db.query.users.findFirst({
      where: eq(users.username, username),
      columns: { id: true },
    });
    if (existing !== undefined) {
      throw new BadRequestException("用户名已存在");
    }
  }

  private async ensureUserExists(id: string): Promise<void> {
    if ((await this.findUserOption(id)) === undefined) {
      throw new NotFoundException("未找到用户");
    }
  }

  private async getUserOption(id: string): Promise<UserOption> {
    const row = await this.findUserOption(id);
    if (row === undefined) {
      throw new NotFoundException("未找到用户");
    }
    return this.toUserOption(row);
  }

  private async findUserOption(id: string): Promise<UserOptionRow | undefined> {
    const [row] = await db
      .select({
        id: users.id,
        username: users.username,
        name: users.name,
        platformRole: users.platformRole,
        status: users.status,
        departmentId: users.departmentId,
        departmentName: departments.name,
      })
      .from(users)
      .innerJoin(departments, eq(departments.id, users.departmentId))
      .where(eq(users.id, id))
      .limit(1);
    return row;
  }

  private async revokeUserSessions(userId: string): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
  }

  private toUserOption(row: UserOptionRow): UserOption {
    return {
      id: row.id,
      username: row.username,
      name: row.name,
      platformRole: row.platformRole,
      status: row.status,
      departmentId: row.departmentId,
      departmentName: row.departmentName,
    };
  }
}
