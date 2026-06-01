import { Body, Controller, Get, Inject, Post, Req, Res } from "@nestjs/common";
import { loginRequestSchema } from "@knowflow/shared";

import { AuthService } from "./auth.service.js";
import type {
  AuthLoginSuccess,
  AuthMeSuccess,
  EmptySuccess,
  RequestLike,
  ResponseLike,
} from "./auth.types.js";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post("login")
  async login(
    @Body() body: unknown,
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthLoginSuccess> {
    const input = loginRequestSchema.parse(body);
    const user = await this.authService.login(input, request, response);
    return {
      ok: true,
      data: {
        user,
      },
    };
  }

  @Post("logout")
  async logout(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<EmptySuccess> {
    await this.authService.logout(request, response);
    return {
      ok: true,
      data: {},
    };
  }

  @Get("me")
  async me(@Req() request: RequestLike): Promise<AuthMeSuccess> {
    const user = await this.authService.me(request);
    return {
      ok: true,
      data: user,
    };
  }

  @Post("refresh")
  async refresh(
    @Req() request: RequestLike,
    @Res({ passthrough: true }) response: ResponseLike,
  ): Promise<AuthLoginSuccess> {
    const user = await this.authService.refresh(request, response);
    return {
      ok: true,
      data: {
        user,
      },
    };
  }
}
