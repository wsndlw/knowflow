import { z } from "zod";

import {
  DOCUMENT_PROCESS_STATUSES,
  KNOWLEDGE_BASE_VISIBILITIES,
  MODEL_USAGE_TYPES,
  PLATFORM_ROLES,
} from "./constants";

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export const knowledgeBaseVisibilitySchema = z.enum(KNOWLEDGE_BASE_VISIBILITIES);
export const documentProcessStatusSchema = z.enum(DOCUMENT_PROCESS_STATUSES);
export const modelUsageTypeSchema = z.enum(MODEL_USAGE_TYPES);

export const apiErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export const apiSuccessSchema = <T extends z.ZodType>(dataSchema: T) =>
  z.object({
    ok: z.literal(true),
    data: dataSchema,
  });

export const apiFailureSchema = z.object({
  ok: z.literal(false),
  error: apiErrorSchema,
});

export const healthStatusSchema = z.enum(["ok", "degraded", "error"]);

export const dependencyHealthSchema = z.object({
  status: z.enum(["ok", "error"]),
  latencyMs: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export const healthResponseSchema = z.object({
  status: healthStatusSchema,
  service: z.literal("api"),
  timestamp: z.iso.datetime(),
  dependencies: z.object({
    database: dependencyHealthSchema,
    redis: dependencyHealthSchema,
  }),
});

export const loginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

export const currentUserSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  platformRole: platformRoleSchema,
  departmentId: z.uuid(),
});

export const loginResponseSchema = z.object({
  user: currentUserSchema,
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type KnowledgeBaseVisibility = z.infer<typeof knowledgeBaseVisibilitySchema>;
export type DocumentProcessStatus = z.infer<typeof documentProcessStatusSchema>;
export type ModelUsageType = z.infer<typeof modelUsageTypeSchema>;
