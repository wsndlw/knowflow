import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "knowflow:isPublic";

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
