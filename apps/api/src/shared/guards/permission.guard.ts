import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { PlatformRole } from "@knowflow/shared";

import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "./auth.guard.js";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic =
      this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (isPublic) {
      return true;
    }

    const rolesMetadata = this.reflector.getAllAndOverride<unknown>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredRoles: PlatformRole[] = Array.isArray(rolesMetadata)
      ? (rolesMetadata as PlatformRole[])
      : [];
    if (requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRole = request.user?.platformRole;
    if (userRole !== undefined && requiredRoles.includes(userRole)) {
      return true;
    }

    throw new ForbiddenException("Insufficient platform role");
  }
}
