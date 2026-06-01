import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { AuthService } from "../../modules/domains/auth/auth.service.js";
import type {
  AuthenticatedUser,
  RequestLike,
} from "../../modules/domains/auth/auth.types.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

export type AuthenticatedRequest = RequestLike & {
  user?: AuthenticatedUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic =
      this.reflector.getAllAndOverride(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const { user } = await this.authService.authenticateRequest(request, "access");
    request.user = user;
    return true;
  }
}
