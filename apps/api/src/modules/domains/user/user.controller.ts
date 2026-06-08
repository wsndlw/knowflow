import {
  Body,
  Controller,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  createUserRequestSchema,
  resetUserPasswordRequestSchema,
  updateUserRoleRequestSchema,
  userOptionSchema,
  uuidParamSchema,
  type UserOption,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import { Roles } from "../../../shared/decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { UserService } from "./user.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
@Roles("super_admin")
export class UserController {
  constructor(@Inject(UserService) private readonly userService: UserService) {}

  @Post("admin/users")
  @AuditLog("user.create", AuditTargetType.USER)
  async createUser(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<UserOption>> {
    const input = createUserRequestSchema.parse(body);
    const data = await this.userService.createUser(input, this.requireUser(request));
    return { ok: true, data: userOptionSchema.parse(data) };
  }

  @Patch("admin/users/:id/role")
  @AuditLog("user.role.update", AuditTargetType.USER)
  async updateRole(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<UserOption>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateUserRoleRequestSchema.parse(body);
    const data = await this.userService.updateRole(id, input, this.requireUser(request));
    return { ok: true, data: userOptionSchema.parse(data) };
  }

  @Patch("admin/users/:id/password")
  @AuditLog("user.password.reset", AuditTargetType.USER)
  async resetPassword(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    const input = resetUserPasswordRequestSchema.parse(body);
    await this.userService.resetPassword(id, input, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Post("admin/users/:id/disable")
  @AuditLog("user.disable", AuditTargetType.USER)
  async disableUser(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<UserOption>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.userService.disableUser(id, this.requireUser(request));
    return { ok: true, data: userOptionSchema.parse(data) };
  }

  @Post("admin/users/:id/enable")
  @AuditLog("user.enable", AuditTargetType.USER)
  async enableUser(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<UserOption>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.userService.enableUser(id, this.requireUser(request));
    return { ok: true, data: userOptionSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("已认证请求缺少用户信息");
    }

    return request.user;
  }
}
