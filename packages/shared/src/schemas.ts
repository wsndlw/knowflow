import { z } from "zod";

import {
  DOCUMENT_PROCESS_STATUSES,
  KNOWLEDGE_BASE_INDEX_STATUSES,
  KNOWLEDGE_BASE_STATUSES,
  KNOWLEDGE_BASE_VISIBILITIES,
  MODEL_USAGE_TYPES,
  PLATFORM_ROLES,
} from "./constants";

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export const knowledgeBaseVisibilitySchema = z.enum(KNOWLEDGE_BASE_VISIBILITIES);
export const knowledgeBaseStatusSchema = z.enum(KNOWLEDGE_BASE_STATUSES);
export const knowledgeBaseIndexStatusSchema = z.enum(KNOWLEDGE_BASE_INDEX_STATUSES);
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

export const uuidParamSchema = z.object({
  id: z.uuid(),
});

export const knowledgeBaseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  visibility: knowledgeBaseVisibilitySchema,
  status: knowledgeBaseStatusSchema,
  indexStatus: knowledgeBaseIndexStatusSchema,
  creatorId: z.uuid(),
  creatorName: z.string(),
  embeddingModel: z.string(),
  embeddingDimension: z.number().int().positive(),
  canManage: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const knowledgeBaseListQuerySchema = z.object({
  status: knowledgeBaseStatusSchema.optional(),
  visibility: knowledgeBaseVisibilitySchema.optional(),
  keyword: z.string().trim().min(1).max(120).optional(),
});

export const knowledgeBaseListResponseSchema = z.object({
  items: z.array(knowledgeBaseSchema),
});

export const createKnowledgeBaseRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  departmentId: z.uuid(),
  visibility: knowledgeBaseVisibilitySchema.default("department"),
});

export const updateKnowledgeBaseRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    visibility: knowledgeBaseVisibilitySchema.optional(),
    status: knowledgeBaseStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const knowledgeBaseMemberSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  platformRole: platformRoleSchema,
  departmentId: z.uuid(),
  departmentName: z.string(),
  isAdmin: z.boolean(),
  joinedAt: z.iso.datetime().nullable(),
  adminSince: z.iso.datetime().nullable(),
});

export const knowledgeBaseMembersResponseSchema = z.object({
  items: z.array(knowledgeBaseMemberSchema),
});

export const knowledgeBaseUserRequestSchema = z.object({
  userId: z.uuid(),
});

export const departmentOptionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});

export const departmentOptionsResponseSchema = z.object({
  items: z.array(departmentOptionSchema),
});

export const userOptionSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string(),
  platformRole: platformRoleSchema,
  departmentId: z.uuid(),
  departmentName: z.string(),
});

export const userOptionsResponseSchema = z.object({
  items: z.array(userOptionSchema),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
export type CurrentUser = z.infer<typeof currentUserSchema>;
export type PlatformRole = z.infer<typeof platformRoleSchema>;
export type KnowledgeBaseVisibility = z.infer<typeof knowledgeBaseVisibilitySchema>;
export type KnowledgeBaseStatus = z.infer<typeof knowledgeBaseStatusSchema>;
export type KnowledgeBaseIndexStatus = z.infer<typeof knowledgeBaseIndexStatusSchema>;
export type KnowledgeBase = z.infer<typeof knowledgeBaseSchema>;
export type KnowledgeBaseListQuery = z.infer<typeof knowledgeBaseListQuerySchema>;
export type KnowledgeBaseListResponse = z.infer<typeof knowledgeBaseListResponseSchema>;
export type CreateKnowledgeBaseRequest = z.infer<typeof createKnowledgeBaseRequestSchema>;
export type UpdateKnowledgeBaseRequest = z.infer<typeof updateKnowledgeBaseRequestSchema>;
export type KnowledgeBaseMember = z.infer<typeof knowledgeBaseMemberSchema>;
export type KnowledgeBaseMembersResponse = z.infer<
  typeof knowledgeBaseMembersResponseSchema
>;
export type KnowledgeBaseUserRequest = z.infer<typeof knowledgeBaseUserRequestSchema>;
export type DepartmentOption = z.infer<typeof departmentOptionSchema>;
export type DepartmentOptionsResponse = z.infer<typeof departmentOptionsResponseSchema>;
export type UserOption = z.infer<typeof userOptionSchema>;
export type UserOptionsResponse = z.infer<typeof userOptionsResponseSchema>;
export type DocumentProcessStatus = z.infer<typeof documentProcessStatusSchema>;
export type ModelUsageType = z.infer<typeof modelUsageTypeSchema>;
