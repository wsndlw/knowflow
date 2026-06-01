import { z } from "zod";

import {
  DOCUMENT_PROCESS_STATUSES,
  DOCUMENT_SOURCE_TYPES,
  AGENT_STATUSES,
  AGENT_TYPES,
  AGENT_VISIBILITIES,
  CITATION_SOURCE_TYPES,
  CONFIDENCE_LEVELS,
  FEEDBACK_RATINGS,
  KNOWLEDGE_BASE_INDEX_STATUSES,
  KNOWLEDGE_BASE_STATUSES,
  KNOWLEDGE_BASE_VISIBILITIES,
  MODEL_USAGE_TYPES,
  NO_ANSWER_TYPES,
  PLATFORM_ROLES,
} from "./constants";

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export const knowledgeBaseVisibilitySchema = z.enum(KNOWLEDGE_BASE_VISIBILITIES);
export const knowledgeBaseStatusSchema = z.enum(KNOWLEDGE_BASE_STATUSES);
export const knowledgeBaseIndexStatusSchema = z.enum(KNOWLEDGE_BASE_INDEX_STATUSES);
export const documentProcessStatusSchema = z.enum(DOCUMENT_PROCESS_STATUSES);
export const documentSourceTypeSchema = z.enum(DOCUMENT_SOURCE_TYPES);
export const modelUsageTypeSchema = z.enum(MODEL_USAGE_TYPES);
export const agentTypeSchema = z.enum(AGENT_TYPES);
export const agentVisibilitySchema = z.enum(AGENT_VISIBILITIES);
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export const confidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export const noAnswerTypeSchema = z.enum(NO_ANSWER_TYPES);
export const citationSourceTypeSchema = z.enum(CITATION_SOURCE_TYPES);
export const feedbackRatingSchema = z.enum(FEEDBACK_RATINGS);

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

export const documentSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  title: z.string(),
  sourceType: documentSourceTypeSchema,
  sourceUri: z.string().nullable(),
  fileId: z.uuid().nullable(),
  fileType: z.string().nullable(),
  fileSize: z.number().int().nonnegative().nullable(),
  uploaderId: z.uuid(),
  uploaderName: z.string(),
  processStatus: documentProcessStatusSchema,
  parseStatus: documentProcessStatusSchema,
  chunkStatus: documentProcessStatusSchema,
  embeddingStatus: z.enum(["pending", "embedding", "completed", "failed"]),
  enabled: z.boolean(),
  errorMessage: z.string().nullable(),
  parentChunkCount: z.number().int().nonnegative(),
  childChunkCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const documentListResponseSchema = z.object({
  items: z.array(documentSchema),
});

export const documentProgressEventSchema = z.object({
  documentId: z.uuid(),
  stage: documentProcessStatusSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string(),
  timestamp: z.iso.datetime(),
});

export const agentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  type: agentTypeSchema,
  visibility: agentVisibilitySchema,
  status: agentStatusSchema,
  isDefault: z.boolean(),
  openingMessage: z.string().nullable(),
  recommendedQuestions: z.array(z.string()),
});

export const agentListResponseSchema = z.object({
  items: z.array(agentSchema),
});

export const managedAgentSchema = agentSchema.extend({
  knowledgeBaseIds: z.array(z.uuid()),
  systemPrompt: z.string().nullable(),
  answerStyle: z.string().nullable(),
  allowAttachments: z.boolean(),
  forceCitation: z.boolean(),
  modelProvider: z.string().nullable(),
  modelName: z.string().nullable(),
  modelConfig: z.record(z.string(), z.unknown()),
  createdBy: z.uuid(),
  publishedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const recommendedQuestionsInputSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(5);

const agentModelConfigSchema = z.record(z.string(), z.unknown()).default({});

export const createManagedAgentRequestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).nullable().optional(),
  systemPrompt: z.string().trim().min(1).max(8000).optional(),
  openingMessage: z.string().trim().max(1000).nullable().optional(),
  recommendedQuestions: recommendedQuestionsInputSchema.optional(),
  answerStyle: z.string().trim().max(80).nullable().optional(),
  allowAttachments: z.boolean().optional(),
  visibility: z.literal("knowledge_base_members").optional(),
  modelProvider: z.string().trim().max(120).nullable().optional(),
  modelName: z.string().trim().max(120).nullable().optional(),
  modelConfig: agentModelConfigSchema.optional(),
});

export const updateManagedAgentRequestSchema = createManagedAgentRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const managedAgentListResponseSchema = z.object({
  items: z.array(managedAgentSchema),
});

export const generateManagedAgentResponseSchema = z.object({
  agent: managedAgentSchema,
  generated: z.object({
    usedFallback: z.boolean(),
  }),
});

export const conversationSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  title: z.string(),
  status: z.enum(["active", "archived"]),
  pinned: z.boolean(),
  favorited: z.boolean(),
  lastMessageAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const conversationListResponseSchema = z.object({
  items: z.array(conversationSchema),
});

export const createConversationRequestSchema = z.object({
  agentId: z.uuid(),
  title: z.string().trim().min(1).max(255).optional(),
});

export const citationSchema = z.object({
  id: z.uuid().optional(),
  sourceType: citationSourceTypeSchema,
  sourceId: z.uuid().nullable(),
  knowledgeBaseId: z.uuid().nullable(),
  knowledgeBaseName: z.string().nullable(),
  documentId: z.uuid().nullable(),
  knowledgeItemId: z.uuid().nullable(),
  chunkId: z.uuid().nullable(),
  title: z.string(),
  snippet: z.string().nullable(),
  pageOrSection: z.string().nullable(),
});

export const relatedDocumentSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  knowledgeBaseName: z.string().nullable(),
  title: z.string(),
});

export const conversationMessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  confidenceLevel: confidenceLevelSchema.nullable(),
  noAnswerType: noAnswerTypeSchema.nullable(),
  citations: z.array(citationSchema),
  recommendedQuestions: z.array(z.string()),
  relatedDocuments: z.array(relatedDocumentSchema),
  createdAt: z.iso.datetime(),
});

export const conversationMessagesResponseSchema = z.object({
  items: z.array(conversationMessageSchema),
});

export const askMessageRequestSchema = z.object({
  content: z.string().trim().min(1).max(8000),
});

export const askStreamEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent.started"),
    conversationId: z.uuid(),
    userMessageId: z.uuid(),
  }),
  z.object({
    type: z.literal("agent.step.started"),
    step: z.string(),
  }),
  z.object({
    type: z.literal("agent.step.completed"),
    step: z.string(),
  }),
  z.object({
    type: z.literal("agent.retrieval.completed"),
    contextCount: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("agent.answer.delta"),
    delta: z.string(),
  }),
  z.object({
    type: z.literal("agent.citations.ready"),
    citations: z.array(citationSchema),
  }),
  z.object({
    type: z.literal("agent.completed"),
    message: conversationMessageSchema,
  }),
  z.object({
    type: z.literal("agent.failed"),
    message: z.string(),
  }),
]);

export const answerFeedbackRequestSchema = z
  .object({
    rating: feedbackRatingSchema,
    reason: z.string().trim().max(120).optional(),
    correctionContent: z.string().trim().max(4000).optional(),
    suggestedSource: z.string().trim().max(1000).optional(),
    suggestedIngestion: z.boolean().optional(),
  })
  .refine((value) => value.rating !== "correction" || value.correctionContent !== undefined, {
    message: "Correction content is required",
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
export type DocumentSourceType = z.infer<typeof documentSourceTypeSchema>;
export type KnowledgeDocument = z.infer<typeof documentSchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type DocumentProgressEvent = z.infer<typeof documentProgressEventSchema>;
export type ModelUsageType = z.infer<typeof modelUsageTypeSchema>;
export type Agent = z.infer<typeof agentSchema>;
export type AgentListResponse = z.infer<typeof agentListResponseSchema>;
export type ManagedAgent = z.infer<typeof managedAgentSchema>;
export type CreateManagedAgentRequest = z.infer<
  typeof createManagedAgentRequestSchema
>;
export type UpdateManagedAgentRequest = z.infer<
  typeof updateManagedAgentRequestSchema
>;
export type ManagedAgentListResponse = z.infer<typeof managedAgentListResponseSchema>;
export type GenerateManagedAgentResponse = z.infer<
  typeof generateManagedAgentResponseSchema
>;
export type Conversation = z.infer<typeof conversationSchema>;
export type ConversationListResponse = z.infer<typeof conversationListResponseSchema>;
export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type RelatedDocument = z.infer<typeof relatedDocumentSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type ConversationMessagesResponse = z.infer<typeof conversationMessagesResponseSchema>;
export type AskMessageRequest = z.infer<typeof askMessageRequestSchema>;
export type AskStreamEvent = z.infer<typeof askStreamEventSchema>;
export type ConfidenceLevel = z.infer<typeof confidenceLevelSchema>;
export type NoAnswerType = z.infer<typeof noAnswerTypeSchema>;
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export type AnswerFeedbackRequest = z.infer<typeof answerFeedbackRequestSchema>;
