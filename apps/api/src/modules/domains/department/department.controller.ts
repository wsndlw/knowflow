import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  addDepartmentMemberRequestSchema,
  adminUserListResponseSchema,
  assignUserDepartmentRequestSchema,
  createDepartmentRequestSchema,
  departmentListResponseSchema,
  departmentMembersResponseSchema,
  departmentSchema,
  transferDepartmentMemberRequestSchema,
  updateDepartmentRequestSchema,
  userOptionSchema,
  uuidParamSchema,
  type AdminUserListResponse,
  type Department,
  type DepartmentListResponse,
  type DepartmentMembersResponse,
  type UserOption,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import { Roles } from "../../../shared/decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { DepartmentService } from "./department.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
export class DepartmentController {
  constructor(
    @Inject(DepartmentService)
    private readonly departmentService: DepartmentService,
  ) {}

  @Get("admin/departments")
  @Roles("super_admin", "department_admin")
  async listDepartments(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<DepartmentListResponse>> {
    const data = await this.departmentService.listDepartments(this.requireUser(request));
    return { ok: true, data: departmentListResponseSchema.parse(data) };
  }

  @Post("admin/departments")
  @Roles("super_admin")
  @AuditLog("department.create", AuditTargetType.DEPARTMENT)
  async createDepartment(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<Department>> {
    const input = createDepartmentRequestSchema.parse(body);
    const data = await this.departmentService.createDepartment(input, this.requireUser(request));
    return { ok: true, data: departmentSchema.parse(data) };
  }

  @Patch("admin/departments/:id")
  @Roles("super_admin")
  @AuditLog("department.update", AuditTargetType.DEPARTMENT)
  async updateDepartment(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<Department>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateDepartmentRequestSchema.parse(body);
    const data = await this.departmentService.updateDepartment(id, input, this.requireUser(request));
    return { ok: true, data: departmentSchema.parse(data) };
  }

  @Delete("admin/departments/:id")
  @Roles("super_admin")
  @AuditLog("department.delete", AuditTargetType.DEPARTMENT)
  async deleteDepartment(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.departmentService.deleteDepartment(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Get("admin/departments/:id/members")
  @Roles("super_admin", "department_admin")
  async listMembers(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<DepartmentMembersResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.departmentService.listMembers(id, this.requireUser(request));
    return { ok: true, data: departmentMembersResponseSchema.parse(data) };
  }

  @Post("admin/departments/:id/members")
  @Roles("super_admin", "department_admin")
  @AuditLog("department.member.add", AuditTargetType.DEPARTMENT)
  async addMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    const { userId } = addDepartmentMemberRequestSchema.parse(body);
    await this.departmentService.addMember(id, userId, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Patch("admin/departments/:id/members/:userId/department")
  @Roles("super_admin", "department_admin")
  @AuditLog("department.member.transfer", AuditTargetType.DEPARTMENT)
  async transferMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const parsed = uuidParamSchema
      .extend({ userId: addDepartmentMemberRequestSchema.shape.userId })
      .parse(params);
    const { targetDepartmentId } = transferDepartmentMemberRequestSchema.parse(body);
    await this.departmentService.transferMember(
      parsed.id,
      parsed.userId,
      targetDepartmentId,
      this.requireUser(request),
    );
    return { ok: true, data: {} };
  }

  @Get("admin/users")
  @Roles("super_admin", "department_admin")
  async listUsers(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<AdminUserListResponse>> {
    const data = await this.departmentService.listUsers(this.requireUser(request));
    return { ok: true, data: adminUserListResponseSchema.parse(data) };
  }

  @Patch("admin/users/:id/department")
  @Roles("super_admin", "department_admin")
  @AuditLog("user.department.assign", AuditTargetType.USER)
  async assignUserDepartment(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<UserOption>> {
    const { id } = uuidParamSchema.parse(params);
    const input = assignUserDepartmentRequestSchema.parse(body);
    const data = await this.departmentService.assignUserDepartment(
      id,
      input,
      this.requireUser(request),
    );
    return { ok: true, data: userOptionSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
