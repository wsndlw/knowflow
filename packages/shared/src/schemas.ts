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
  KNOWLEDGE_ITEM_FEEDBACK_RATINGS,
  KNOWLEDGE_ITEM_STATUSES,
  IMPROVEMENT_TASK_STATUSES,
  IMPROVEMENT_TRIGGER_TYPES,
  MODEL_USAGE_TYPES,
  MODEL_PROVIDER_TYPES,
  MODEL_TYPES,
  NO_ANSWER_TYPES,
  PLATFORM_ROLES,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_TARGET_TYPES,
  VERIFICATION_STATUSES,
} from "./constants";

export const platformRoleSchema = z.enum(PLATFORM_ROLES);
export const knowledgeBaseVisibilitySchema = z.enum(KNOWLEDGE_BASE_VISIBILITIES);
export const knowledgeBaseStatusSchema = z.enum(KNOWLEDGE_BASE_STATUSES);
export const knowledgeBaseIndexStatusSchema = z.enum(KNOWLEDGE_BASE_INDEX_STATUSES);
export const knowledgeItemStatusSchema = z.enum(KNOWLEDGE_ITEM_STATUSES);
export const knowledgeItemFeedbackRatingSchema = z.enum(KNOWLEDGE_ITEM_FEEDBACK_RATINGS);
export const documentProcessStatusSchema = z.enum(DOCUMENT_PROCESS_STATUSES);
export const documentSourceTypeSchema = z.enum(DOCUMENT_SOURCE_TYPES);
export const modelUsageTypeSchema = z.enum(MODEL_USAGE_TYPES);
export const modelProviderTypeSchema = z.enum(MODEL_PROVIDER_TYPES);
export const modelTypeSchema = z.enum(MODEL_TYPES);
export const agentTypeSchema = z.enum(AGENT_TYPES);
export const agentVisibilitySchema = z.enum(AGENT_VISIBILITIES);
export const agentStatusSchema = z.enum(AGENT_STATUSES);
export const confidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
export const noAnswerTypeSchema = z.enum(NO_ANSWER_TYPES);
export const citationSourceTypeSchema = z.enum(CITATION_SOURCE_TYPES);
export const feedbackRatingSchema = z.enum(FEEDBACK_RATINGS);
export const improvementTriggerTypeSchema = z.enum(IMPROVEMENT_TRIGGER_TYPES);
export const improvementTaskStatusSchema = z.enum(IMPROVEMENT_TASK_STATUSES);
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);
export const analyticsEventTypeSchema = z.enum(ANALYTICS_EVENT_TYPES);
export const analyticsTargetTypeSchema = z.enum(ANALYTICS_TARGET_TYPES);

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

export const knowledgeBaseOverviewSchema = z.object({
  documentCount: z.number().int().nonnegative(),
  knowledgeItemCount: z.number().int().nonnegative(),
  publishedKnowledgeItemCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  documentStatusCounts: z.record(z.string(), z.number().int().nonnegative()),
  knowledgeItemStatusCounts: z.record(z.string(), z.number().int().nonnegative()),
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
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export const documentListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  status: documentProcessStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const documentProgressEventSchema = z.object({
  documentId: z.uuid(),
  stage: documentProcessStatusSchema,
  percent: z.number().int().min(0).max(100),
  message: z.string(),
  timestamp: z.iso.datetime(),
});

export const knowledgeItemSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  knowledgeBaseName: z.string(),
  title: z.string(),
  content: z.string(),
  summary: z.string().nullable(),
  sourceDocumentId: z.uuid().nullable(),
  status: knowledgeItemStatusSchema,
  metadata: z.record(z.string(), z.unknown()),
  enabled: z.boolean(),
  viewCount: z.number().int().nonnegative(),
  citeCount: z.number().int().nonnegative(),
  likeCount: z.number().int().nonnegative(),
  dislikeCount: z.number().int().nonnegative(),
  userFeedback: knowledgeItemFeedbackRatingSchema.nullable(),
  createdBy: z.uuid(),
  updatedBy: z.uuid().nullable(),
  verifiedBy: z.uuid().nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const knowledgeItemListQuerySchema = z.object({
  keyword: z.string().trim().min(1).max(120).optional(),
  status: knowledgeItemStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const knowledgeItemListResponseSchema = z.object({
  items: z.array(knowledgeItemSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export const createKnowledgeItemRequestSchema = z.object({
  title: z.string().trim().min(1).max(255),
  content: z.string().trim().min(1).max(20000),
  summary: z.string().trim().max(2000).nullable().optional(),
  sourceDocumentId: z.uuid().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateKnowledgeItemRequestSchema = createKnowledgeItemRequestSchema
  .partial()
  .extend({
    status: knowledgeItemStatusSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const knowledgeItemFeedbackRequestSchema = z.object({
  rating: knowledgeItemFeedbackRatingSchema.nullable(),
});

export const batchImportResponseSchema = z.object({
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  errors: z.array(
    z.object({
      row: z.number().int().positive(),
      reason: z.string(),
    }),
  ),
});

export const improvementTaskSchema = z.object({
  id: z.uuid(),
  knowledgeBaseId: z.uuid(),
  triggerType: improvementTriggerTypeSchema,
  sourceMessageId: z.uuid().nullable(),
  sourceFeedbackId: z.uuid().nullable(),
  sourceQuestion: z.string(),
  sourceContext: z.record(z.string(), z.unknown()),
  status: improvementTaskStatusSchema,
  candidateTitle: z.string().nullable(),
  candidateContent: z.string().nullable(),
  candidateSummary: z.string().nullable(),
  candidateMetadata: z.record(z.string(), z.unknown()),
  aiConfidence: z.number().min(0).max(1).nullable(),
  aiReasoning: z.string().nullable(),
  reviewedBy: z.uuid().nullable(),
  reviewedAt: z.iso.datetime().nullable(),
  reviewNote: z.string().nullable(),
  publishedItemId: z.uuid().nullable(),
  verificationStatus: verificationStatusSchema.nullable(),
  verifiedAt: z.iso.datetime().nullable(),
  dedupKey: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const improvementTaskListQuerySchema = z.object({
  status: improvementTaskStatusSchema.optional(),
  triggerType: improvementTriggerTypeSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const improvementTaskListResponseSchema = z.object({
  items: z.array(improvementTaskSchema),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
  total: z.number().int().nonnegative(),
});

export const generateImprovementTasksRequestSchema = z.object({
  messageId: z.uuid().optional(),
});

export const createImprovementTasksResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  tasks: z.array(improvementTaskSchema),
});

export const approveImprovementTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  content: z.string().trim().min(1).max(20000).optional(),
  summary: z.string().trim().max(2000).nullable().optional(),
});

export const rejectImprovementTaskRequestSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export const improvementTaskStatsSchema = z.object({
  pending: z.number().int().nonnegative(),
  candidateReady: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  published: z.number().int().nonnegative(),
  verified: z.number().int().nonnegative(),
  stillFailing: z.number().int().nonnegative(),
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

export const analyticsRangeSchema = z.enum(["today", "7d", "30d", "custom"]);

export const analyticsRangeQuerySchema = z
  .object({
    range: analyticsRangeSchema.default("7d"),
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
  })
  .refine(
    (value) => value.range !== "custom" || (value.from !== undefined && value.to !== undefined),
    {
      message: "Custom range requires from and to dates",
    },
  );

export const analyticsEventRequestSchema = z.object({
  eventType: analyticsEventTypeSchema,
  targetType: analyticsTargetTypeSchema.optional(),
  targetId: z.uuid().optional(),
  knowledgeBaseId: z.uuid().optional(),
  sessionId: z.string().trim().min(1).max(160).optional(),
  agentId: z.uuid().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const analyticsEventSchema = z.object({
  id: z.uuid(),
  eventType: analyticsEventTypeSchema,
  targetType: analyticsTargetTypeSchema.nullable(),
  targetId: z.uuid().nullable(),
  knowledgeBaseId: z.uuid().nullable(),
  sessionId: z.string().nullable(),
  agentId: z.uuid().nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  createdDate: z.iso.date(),
  createdAt: z.iso.datetime(),
});

export const analyticsMetricSchema = z.object({
  visits: z.number().int().nonnegative(),
  searches: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  activeUsers: z.number().int().nonnegative(),
});

export const analyticsTopContentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  views: z.number().int().nonnegative(),
  citations: z.number().int().nonnegative(),
  lastViewedAt: z.iso.datetime().nullable(),
});

export const analyticsNoAnswerQuestionSchema = z.object({
  question: z.string(),
  count: z.number().int().nonnegative(),
  noAnswerType: noAnswerTypeSchema.nullable(),
});

export const analyticsTrendValueSchema = z.object({
  current: z.number().int().nonnegative(),
  previous: z.number().int().nonnegative(),
});

export const analyticsTrendSchema = z.object({
  visits: analyticsTrendValueSchema,
  searches: analyticsTrendValueSchema,
  questions: analyticsTrendValueSchema,
  activeUsers: analyticsTrendValueSchema,
});

export const analyticsUnvisitedContentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  type: z.enum(["document", "knowledge_item"]),
  views: z.number().int().nonnegative(),
  lastViewedAt: z.iso.datetime().nullable(),
});

export const analyticsLowConfidenceQuestionSchema = z.object({
  question: z.string(),
  count: z.number().int().nonnegative(),
  lastAskedAt: z.iso.datetime().nullable(),
});

export const analyticsFeedbackReasonSchema = z.object({
  reason: z.string(),
  count: z.number().int().nonnegative(),
});

export const analyticsFeedbackSummarySchema = z.object({
  answerUseful: z.number().int().nonnegative(),
  answerNotUseful: z.number().int().nonnegative(),
  answerCorrections: z.number().int().nonnegative(),
  knowledgeItemLikes: z.number().int().nonnegative(),
  knowledgeItemDislikes: z.number().int().nonnegative(),
});

export const knowledgeBaseAnalyticsResponseSchema = z.object({
  range: analyticsRangeQuerySchema,
  knowledgeBaseId: z.uuid(),
  metrics: analyticsMetricSchema,
  trends: analyticsTrendSchema,
  popularDocuments: z.array(analyticsTopContentSchema),
  popularKnowledgeItems: z.array(analyticsTopContentSchema),
  unvisitedContent: z.array(analyticsUnvisitedContentSchema),
  noAnswerQuestions: z.array(analyticsNoAnswerQuestionSchema),
  lowConfidenceQuestions: z.array(analyticsLowConfidenceQuestionSchema),
  feedback: analyticsFeedbackSummarySchema,
  feedbackReasons: z.array(analyticsFeedbackReasonSchema),
});

export const analyticsKnowledgeBaseRankingSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  visits: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
});

export const analyticsEntityTotalsSchema = z.object({
  userCount: z.number().int().nonnegative(),
  knowledgeBaseCount: z.number().int().nonnegative(),
  documentCount: z.number().int().nonnegative(),
  agentCount: z.number().int().nonnegative(),
});

export const analyticsOverviewResponseSchema = z.object({
  range: analyticsRangeQuerySchema,
  totals: analyticsMetricSchema,
  entityTotals: analyticsEntityTotalsSchema,
  sevenDayActiveUsers: z.number().int().nonnegative(),
  knowledgeBases: z.array(analyticsKnowledgeBaseRankingSchema),
  topDocuments: z.array(analyticsTopContentSchema.extend({ knowledgeBaseName: z.string() })),
  topKnowledgeItems: z.array(analyticsTopContentSchema.extend({ knowledgeBaseName: z.string() })),
});

export const modelProviderSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  providerType: modelProviderTypeSchema,
  baseUrl: z.string(),
  hasApiKey: z.boolean(),
  apiKeyPreview: z.string().nullable(),
  enabled: z.boolean(),
  timeoutMs: z.number().int().positive(),
  retryCount: z.number().int().nonnegative(),
  concurrencyLimit: z.number().int().positive(),
  dailyQuota: z.number().int().positive().nullable(),
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const modelProviderListResponseSchema = z.object({
  items: z.array(modelProviderSchema),
});

export const createModelProviderRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  providerType: modelProviderTypeSchema,
  baseUrl: z.url(),
  apiKey: z.string().trim().min(1).max(4000).optional(),
  enabled: z.boolean().optional(),
  timeoutMs: z.number().int().min(1000).max(120000).optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  concurrencyLimit: z.number().int().min(1).max(100).optional(),
  dailyQuota: z.number().int().positive().nullable().optional(),
  remark: z.string().trim().max(2000).nullable().optional(),
});

export const updateModelProviderRequestSchema = createModelProviderRequestSchema
  .partial()
  .extend({ apiKey: z.string().trim().min(1).max(4000).nullable().optional() })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const modelCatalogSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  providerName: z.string(),
  modelName: z.string(),
  modelType: modelTypeSchema,
  contextWindow: z.number().int().positive().nullable(),
  supportsStreaming: z.boolean(),
  enabled: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const modelCatalogListResponseSchema = z.object({
  items: z.array(modelCatalogSchema),
});

export const createModelCatalogRequestSchema = z.object({
  modelName: z.string().trim().min(1).max(160),
  modelType: modelTypeSchema,
  contextWindow: z.number().int().positive().nullable().optional(),
  supportsStreaming: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updateModelCatalogRequestSchema = createModelCatalogRequestSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const modelUsagePolicySchema = z.object({
  id: z.uuid(),
  usageType: modelUsageTypeSchema,
  defaultModelId: z.uuid().nullable(),
  fallbackModelId: z.uuid().nullable(),
  enabled: z.boolean(),
  temperature: z.number(),
  maxOutputTokens: z.number().int().positive().nullable(),
  timeoutMs: z.number().int().positive(),
  retryCount: z.number().int().nonnegative(),
  quota: z.number().int().positive().nullable(),
  defaultModel: modelCatalogSchema.nullable(),
  fallbackModel: modelCatalogSchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const modelUsagePolicyListResponseSchema = z.object({
  items: z.array(modelUsagePolicySchema),
});

export const updateModelUsagePolicyRequestSchema = z
  .object({
    defaultModelId: z.uuid().nullable().optional(),
    fallbackModelId: z.uuid().nullable().optional(),
    enabled: z.boolean().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().positive().nullable().optional(),
    timeoutMs: z.number().int().min(1000).max(120000).optional(),
    retryCount: z.number().int().min(0).max(10).optional(),
    quota: z.number().int().positive().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export const testModelProviderRequestSchema = z.object({
  modelId: z.uuid().optional(),
});

export const testModelProviderResponseSchema = z.object({
  ok: z.boolean(),
  latencyMs: z.number().int().nonnegative(),
  modelName: z.string().nullable(),
  error: z.string().nullable(),
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
export type KnowledgeBaseOverview = z.infer<typeof knowledgeBaseOverviewSchema>;
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
export type DocumentListQuery = z.infer<typeof documentListQuerySchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type DocumentProgressEvent = z.infer<typeof documentProgressEventSchema>;
export type KnowledgeItemStatus = z.infer<typeof knowledgeItemStatusSchema>;
export type KnowledgeItemFeedbackRating = z.infer<
  typeof knowledgeItemFeedbackRatingSchema
>;
export type KnowledgeItem = z.infer<typeof knowledgeItemSchema>;
export type KnowledgeItemListQuery = z.infer<typeof knowledgeItemListQuerySchema>;
export type KnowledgeItemListResponse = z.infer<typeof knowledgeItemListResponseSchema>;
export type CreateKnowledgeItemRequest = z.infer<typeof createKnowledgeItemRequestSchema>;
export type UpdateKnowledgeItemRequest = z.infer<typeof updateKnowledgeItemRequestSchema>;
export type KnowledgeItemFeedbackRequest = z.infer<
  typeof knowledgeItemFeedbackRequestSchema
>;
export type BatchImportResponse = z.infer<typeof batchImportResponseSchema>;
export type ImprovementTriggerType = z.infer<typeof improvementTriggerTypeSchema>;
export type ImprovementTaskStatus = z.infer<typeof improvementTaskStatusSchema>;
export type VerificationStatus = z.infer<typeof verificationStatusSchema>;
export type ImprovementTask = z.infer<typeof improvementTaskSchema>;
export type ImprovementTaskListQuery = z.infer<typeof improvementTaskListQuerySchema>;
export type ImprovementTaskListResponse = z.infer<
  typeof improvementTaskListResponseSchema
>;
export type GenerateImprovementTasksRequest = z.infer<
  typeof generateImprovementTasksRequestSchema
>;
export type CreateImprovementTasksResponse = z.infer<
  typeof createImprovementTasksResponseSchema
>;
export type ApproveImprovementTaskRequest = z.infer<
  typeof approveImprovementTaskRequestSchema
>;
export type RejectImprovementTaskRequest = z.infer<
  typeof rejectImprovementTaskRequestSchema
>;
export type ImprovementTaskStats = z.infer<typeof improvementTaskStatsSchema>;
export type ModelUsageType = z.infer<typeof modelUsageTypeSchema>;
export type ModelProviderType = z.infer<typeof modelProviderTypeSchema>;
export type ModelType = z.infer<typeof modelTypeSchema>;
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
export type AnalyticsEventType = z.infer<typeof analyticsEventTypeSchema>;
export type AnalyticsTargetType = z.infer<typeof analyticsTargetTypeSchema>;
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;
export type AnalyticsEventRequest = z.infer<typeof analyticsEventRequestSchema>;
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;
export type AnalyticsTopContent = z.infer<typeof analyticsTopContentSchema>;
export type AnalyticsEntityTotals = z.infer<typeof analyticsEntityTotalsSchema>;
export type KnowledgeBaseAnalyticsResponse = z.infer<
  typeof knowledgeBaseAnalyticsResponseSchema
>;
export type AnalyticsOverviewResponse = z.infer<typeof analyticsOverviewResponseSchema>;
export type ModelProvider = z.infer<typeof modelProviderSchema>;
export type ModelProviderListResponse = z.infer<typeof modelProviderListResponseSchema>;
export type CreateModelProviderRequest = z.infer<typeof createModelProviderRequestSchema>;
export type UpdateModelProviderRequest = z.infer<typeof updateModelProviderRequestSchema>;
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
export type ModelCatalogListResponse = z.infer<typeof modelCatalogListResponseSchema>;
export type CreateModelCatalogRequest = z.infer<typeof createModelCatalogRequestSchema>;
export type UpdateModelCatalogRequest = z.infer<typeof updateModelCatalogRequestSchema>;
export type ModelUsagePolicy = z.infer<typeof modelUsagePolicySchema>;
export type ModelUsagePolicyListResponse = z.infer<typeof modelUsagePolicyListResponseSchema>;
export type UpdateModelUsagePolicyRequest = z.infer<
  typeof updateModelUsagePolicyRequestSchema
>;
export type TestModelProviderRequest = z.infer<typeof testModelProviderRequestSchema>;
export type TestModelProviderResponse = z.infer<typeof testModelProviderResponseSchema>;
