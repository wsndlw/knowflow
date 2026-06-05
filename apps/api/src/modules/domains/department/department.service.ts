import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { db, departmentAdmins, departments, knowledgeBases, users } from "@knowflow/db";
import type {
  AdminUserListResponse,
  AssignUserDepartmentRequest,
  CreateDepartmentRequest,
  Department,
  DepartmentListResponse,
  DepartmentMembersResponse,
  UpdateDepartmentRequest,
  UserOption,
} from "@knowflow/shared";
import { and, asc, count, eq, ne } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";

type DepartmentRow = typeof departments.$inferSelect;

type DepartmentListRow = {
  id: string;
  name: string;
  createdAt: Date;
  memberCount: number;
};

type AdminUserRow = {
  id: string;
  username: string;
  name: string;
  platformRole: UserOption["platformRole"];
  status: UserOption["status"];
  departmentId: string;
  departmentName: string;
};

type DepartmentReferenceCounts = {
  userCount: number;
  knowledgeBaseCount: number;
  adminCount: number;
};

@Injectable()
export class DepartmentService {
  async listDepartments(user: AuthenticatedUser): Promise<DepartmentListResponse> {
    this.ensureAdminUser(user);

    const rows = await db
      .select({
        id: departments.id,
        name: departments.name,
        createdAt: departments.createdAt,
        memberCount: count(users.id),
      })
      .from(departments)
      .leftJoin(users, eq(users.departmentId, departments.id))
      .where(
        user.platformRole === "super_admin"
          ? undefined
          : eq(departments.id, user.departmentId),
      )
      .groupBy(departments.id)
      .orderBy(asc(departments.name));

    return { items: rows.map((row) => this.toDepartmentListItem(row)) };
  }

  async createDepartment(
    input: CreateDepartmentRequest,
    user: AuthenticatedUser,
  ): Promise<Department> {
    this.ensureSuperAdmin(user);
    await this.ensureDepartmentNameAvailable(input.name);

    const [created] = await db
      .insert(departments)
      .values({ name: input.name })
      .returning();
    if (created === undefined) {
      throw new BadRequestException("Failed to create department");
    }

    return this.toDepartment(created);
  }

  async updateDepartment(
    id: string,
    input: UpdateDepartmentRequest,
    user: AuthenticatedUser,
  ): Promise<Department> {
    this.ensureSuperAdmin(user);
    await this.ensureDepartmentExists(id);
    if (input.name !== undefined) {
      await this.ensureDepartmentNameAvailable(input.name, id);
    }

    await db
      .update(departments)
      .set({ name: input.name, updatedAt: new Date() })
      .where(eq(departments.id, id));

    return this.getDepartment(id);
  }

  async deleteDepartment(id: string, user: AuthenticatedUser): Promise<void> {
    this.ensureSuperAdmin(user);
    await this.ensureDepartmentExists(id);

    const counts = await this.countDepartmentReferences(id);
    if (
      counts.userCount > 0 ||
      counts.knowledgeBaseCount > 0 ||
      counts.adminCount > 0
    ) {
      throw new BadRequestException(
        "Cannot delete a department with assigned users, knowledge bases, or admins",
      );
    }

    await db.delete(departments).where(eq(departments.id, id));
  }

  async listMembers(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<DepartmentMembersResponse> {
    await this.ensureCanManageDepartment(departmentId, user);

    const rows = await db
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
      .where(eq(users.departmentId, departmentId))
      .orderBy(asc(users.name), asc(users.username));

    return { items: rows.map((row) => this.toUserOption(row)) };
  }

  async addMember(
    departmentId: string,
    memberUserId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.ensureCanAssignUserToDepartment(memberUserId, departmentId, user);
    await db
      .update(users)
      .set({ departmentId, updatedAt: new Date() })
      .where(eq(users.id, memberUserId));
  }

  async removeMember(
    sourceDepartmentId: string,
    memberUserId: string,
    targetDepartmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.ensureCanManageDepartment(sourceDepartmentId, user);
    if (sourceDepartmentId === targetDepartmentId) {
      throw new BadRequestException("Target department must be different");
    }
    await this.ensureDepartmentExists(targetDepartmentId);

    const member = await this.findUser(memberUserId);
    if (member === undefined) {
      throw new BadRequestException("User not found");
    }
    if (member.departmentId !== sourceDepartmentId) {
      throw new BadRequestException("User is not a member of this department");
    }
    if (user.platformRole === "department_admin") {
      throw new ForbiddenException("Department admins cannot move members out of their department");
    }

    await db
      .update(users)
      .set({ departmentId: targetDepartmentId, updatedAt: new Date() })
      .where(eq(users.id, memberUserId));
  }

  async listUsers(user: AuthenticatedUser): Promise<AdminUserListResponse> {
    this.ensureAdminUser(user);

    const rows = await db
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
      .where(user.platformRole === "super_admin" ? undefined : eq(users.departmentId, user.departmentId))
      .orderBy(asc(users.name), asc(users.username));

    return { items: rows.map((row) => this.toUserOption(row)) };
  }

  async assignUserDepartment(
    userId: string,
    input: AssignUserDepartmentRequest,
    user: AuthenticatedUser,
  ): Promise<UserOption> {
    await this.ensureCanAssignUserToDepartment(userId, input.departmentId, user);
    await db
      .update(users)
      .set({ departmentId: input.departmentId, updatedAt: new Date() })
      .where(eq(users.id, userId));

    const updated = await this.findUser(userId);
    if (updated === undefined) {
      throw new BadRequestException("Failed to assign user department");
    }
    return this.toUserOption(updated);
  }

  private ensureAdminUser(user: AuthenticatedUser): void {
    if (user.platformRole === "super_admin" || user.platformRole === "department_admin") {
      return;
    }
    throw new ForbiddenException("Only admins can manage departments");
  }

  private ensureSuperAdmin(user: AuthenticatedUser): void {
    if (user.platformRole !== "super_admin") {
      throw new ForbiddenException("Only super admins can manage departments");
    }
  }

  private async ensureCanManageDepartment(
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    await this.ensureDepartmentExists(departmentId);
    if (user.platformRole === "super_admin") {
      return;
    }
    if (user.platformRole === "department_admin" && user.departmentId === departmentId) {
      return;
    }
    throw new ForbiddenException("Cannot manage this department");
  }

  private async ensureCanAssignUserToDepartment(
    userId: string,
    departmentId: string,
    user: AuthenticatedUser,
  ): Promise<AdminUserRow> {
    await this.ensureCanManageDepartment(departmentId, user);

    const targetUser = await this.findUser(userId);
    if (targetUser === undefined) {
      throw new BadRequestException("User not found");
    }
    if (
      user.platformRole === "department_admin" &&
      targetUser.departmentId !== user.departmentId
    ) {
      throw new ForbiddenException("Cannot manage users outside your department");
    }

    return targetUser;
  }

  private async getDepartment(id: string): Promise<Department> {
    const row = await this.findDepartment(id);
    if (row === undefined) {
      throw new NotFoundException("Department not found");
    }
    return this.toDepartment(row);
  }

  private async ensureDepartmentExists(id: string): Promise<void> {
    if ((await this.findDepartment(id)) === undefined) {
      throw new NotFoundException("Department not found");
    }
  }

  private async ensureDepartmentNameAvailable(name: string, excludeId?: string): Promise<void> {
    const where =
      excludeId === undefined
        ? eq(departments.name, name)
        : and(eq(departments.name, name), ne(departments.id, excludeId));
    const existing = await db.query.departments.findFirst({
      where,
      columns: {
        id: true,
      },
    });
    if (existing !== undefined) {
      throw new BadRequestException("Department name already exists");
    }
  }

  private async findDepartment(id: string): Promise<DepartmentRow | undefined> {
    return db.query.departments.findFirst({ where: eq(departments.id, id) });
  }

  private async findUser(id: string): Promise<AdminUserRow | undefined> {
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

  private async countDepartmentReferences(id: string): Promise<DepartmentReferenceCounts> {
    const [
      [{ value: userCount } = { value: 0 }],
      [{ value: knowledgeBaseCount } = { value: 0 }],
      [{ value: adminCount } = { value: 0 }],
    ] = await Promise.all([
      db.select({ value: count() }).from(users).where(eq(users.departmentId, id)),
      db
        .select({ value: count() })
        .from(knowledgeBases)
        .where(eq(knowledgeBases.departmentId, id)),
      db
        .select({ value: count() })
        .from(departmentAdmins)
        .where(eq(departmentAdmins.departmentId, id)),
    ]);

    return { userCount, knowledgeBaseCount, adminCount };
  }

  private toDepartment(row: DepartmentRow): Department {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toDepartmentListItem(row: DepartmentListRow): Department {
    return {
      id: row.id,
      name: row.name,
      memberCount: row.memberCount,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private toUserOption(row: AdminUserRow): UserOption {
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
