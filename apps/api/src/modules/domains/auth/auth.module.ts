import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";

import { AuthController } from "./auth.controller.js";
import { AuthSmokeController } from "./auth-smoke.controller.js";
import { AuthService } from "./auth.service.js";
import { AuthGuard } from "../../../shared/guards/auth.guard.js";
import { PermissionGuard } from "../../../shared/guards/permission.guard.js";

@Module({
  controllers: [AuthController, AuthSmokeController],
  providers: [
    AuthService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
