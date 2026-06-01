import { SetMetadata } from "@nestjs/common";
import type { PlatformRole } from "@knowflow/shared";

export const ROLES_KEY = "knowflow:roles";

export const Roles = (...roles: PlatformRole[]) => SetMetadata(ROLES_KEY, roles);
