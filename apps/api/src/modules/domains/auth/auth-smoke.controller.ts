import { Controller, Get } from "@nestjs/common";

import { Roles } from "../../../shared/decorators/roles.decorator.js";

@Controller("auth/smoke")
export class AuthSmokeController {
  @Get("protected")
  getProtected(): { ok: true; data: { protected: true } } {
    return {
      ok: true,
      data: {
        protected: true,
      },
    };
  }

  @Get("super-admin")
  @Roles("super_admin")
  getSuperAdmin(): { ok: true; data: { role: "super_admin" } } {
    return {
      ok: true,
      data: {
        role: "super_admin",
      },
    };
  }
}
