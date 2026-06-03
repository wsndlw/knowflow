import {
  bigint,
  boolean,
  type AnyPgColumn,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  vector,
} from "drizzle-orm/pg-core";

const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const createdOnly = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const platformRoleEnum = pgEnum("platform_role", [
  "super_admin",
  "department_admin",
  "user",
]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const sessionTypeEnum = pgEnum("session_type", ["access", "refresh"]);
export const knowledgeBaseVisibilityEnum = pgEnum("knowledge_base_visibility", [
  "public",
  "department",
  "restricted",
]);
export const knowledgeBaseStatusEnum = pgEnum("knowledge_base_status", [
  "active",
  "disabled",
  "archived",
]);
export const knowledgeBaseIndexStatusEnum = pgEnum("knowledge_base_index_status", [
  "not_indexed",
  "indexing",
  "ready",
  "partial_failed",
  "failed",
]);
export const metadataFieldTypeEnum = pgEnum("metadata_field_type", [
  "text",
  "single_select",
  "multi_select",
  "date",
  "number",
  "boolean",
]);
export const documentSourceTypeEnum = pgEnum("document_source_type", [
  "pdf",
  "docx",
  "txt",
  "markdown",
  "csv",
  "excel",
  "web_url",
  "feishu_doc",
  "feishu_sheet",
  "image",
  "manual",
]);
export const processStatusEnum = pgEnum("process_status", [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "completed",
  "failed",
]);
export const embeddingStatusEnum = pgEnum("embedding_status", [
  "pending",
  "embedding",
  "completed",
  "failed",
]);
export const knowledgeItemStatusEnum = pgEnum("knowledge_item_status", [
  "draft",
  "pending_review",
  "published",
  "unpublished",
  "expired",
]);
export const agentTypeEnum = pgEnum("agent_type", ["global", "official", "personal"]);
export const agentVisibilityEnum = pgEnum("agent_visibility", [
  "global",
  "knowledge_base_members",
  "selected_members",
  "private",
]);
export const agentStatusEnum = pgEnum("agent_status", [
  "draft",
  "published",
  "disabled",
  "archived",
]);
export const retrievalModeEnum = pgEnum("retrieval_mode", [
  "hybrid",
  "hybrid_rerank",
  "vector_only",
  "fts_only",
  "ki_only",
]);
export const modelProviderTypeEnum = pgEnum("model_provider_type", [
  "openai",
  "azure_openai",
  "aliyun",
  "zhipu",
  "deepseek",
  "moonshot",
  "ollama",
  "openai_compatible",
]);
export const modelTypeEnum = pgEnum("model_type", [
  "chat",
  "embedding",
  "rerank",
  "ocr",
  "vision",
  "moderation",
]);
export const modelUsageTypeEnum = pgEnum("model_usage_type", [
  "chat",
  "query_understanding",
  "document_processing",
  "embedding",
  "rerank",
  "ocr",
  "vision",
  "knowledge_production",
  "agent_generation",
]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "archived"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "system"]);
export const confidenceLevelEnum = pgEnum("confidence_level", [
  "strong",
  "medium",
  "weak",
  "not_found",
]);
export const noAnswerTypeEnum = pgEnum("no_answer_type", [
  "no_answer",
  "low_confidence",
  "knowledge_gap",
  "permission_limited",
  "attachment_parse_failed",
]);
export const citationSourceTypeEnum = pgEnum("citation_source_type", [
  "knowledge_document",
  "knowledge_item",
  "conversation_attachment",
]);
export const feedbackRatingEnum = pgEnum("feedback_rating", ["useful", "not_useful", "correction"]);
export const knowledgeItemFeedbackRatingEnum = pgEnum("knowledge_item_feedback_rating", [
  "like",
  "dislike",
]);
export const improvementTriggerTypeEnum = pgEnum("improvement_trigger_type", [
  "no_answer",
  "low_confidence",
  "knowledge_gap",
  "user_correction",
  "answer_dislike",
  "item_dislike",
  "document_extraction",
]);
export const improvementTaskStatusEnum = pgEnum("improvement_task_status", [
  "pending",
  "processing",
  "candidate_ready",
  "approved",
  "rejected",
  "published",
  "failed",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "still_failing",
  "expired",
]);
export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "knowledge_base_viewed",
  "document_viewed",
  "knowledge_item_viewed",
  "knowledge_searched",
  "question_asked",
  "answer_generated",
  "agent_called",
  "citation_clicked",
  "feedback_submitted",
  "attachment_ingestion_requested",
]);
export const analyticsTargetTypeEnum = pgEnum("analytics_target_type", [
  "knowledge_base",
  "document",
  "knowledge_item",
  "agent",
  "message",
  "conversation",
  "citation",
  "attachment",
]);
export const backgroundJobStatusEnum = pgEnum("background_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 120 }).notNull(),
    parentId: uuid("parent_id"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("departments_name_uidx").on(table.name)],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: varchar("username", { length: 80 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    platformRole: platformRoleEnum("platform_role").default("user").notNull(),
    status: userStatusEnum("status").default("active").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("users_username_uidx").on(table.username),
    index("users_department_idx").on(table.departmentId),
  ],
);

export const departmentAdmins = pgTable(
  "department_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("department_admins_department_user_uidx").on(table.departmentId, table.userId),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    sessionTokenHash: text("session_token_hash").notNull(),
    type: sessionTypeEnum("type").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    ip: varchar("ip", { length: 80 }),
    userAgent: text("user_agent"),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_uidx").on(table.sessionTokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const knowledgeBases = pgTable(
  "knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id),
    visibility: knowledgeBaseVisibilityEnum("visibility").default("department").notNull(),
    status: knowledgeBaseStatusEnum("status").default("active").notNull(),
    indexStatus: knowledgeBaseIndexStatusEnum("index_status").default("not_indexed").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id),
    embeddingModel: varchar("embedding_model", { length: 120 })
      .default("text-embedding-v4")
      .notNull(),
    embeddingDimension: integer("embedding_dimension").default(1024).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_bases_department_idx").on(table.departmentId),
    index("knowledge_bases_visibility_idx").on(table.visibility),
  ],
);

export const knowledgeBaseAdmins = pgTable(
  "knowledge_base_admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("knowledge_base_admins_kb_user_uidx").on(table.knowledgeBaseId, table.userId),
  ],
);

export const knowledgeBaseMembers = pgTable(
  "knowledge_base_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("knowledge_base_members_kb_user_uidx").on(table.knowledgeBaseId, table.userId),
  ],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    color: varchar("color", { length: 7 }).default("#3B82F6").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("tags_knowledge_base_idx").on(table.knowledgeBaseId),
    uniqueIndex("tags_knowledge_base_name_uidx").on(table.knowledgeBaseId, table.name),
  ],
);

export const retrievalSettings = pgTable(
  "retrieval_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    mode: retrievalModeEnum("mode").default("hybrid_rerank").notNull(),
    topK: integer("top_k").default(5).notNull(),
    similarityThreshold: numeric("similarity_threshold", {
      precision: 3,
      scale: 2,
    })
      .default("0.70")
      .notNull(),
    rerankEnabled: boolean("rerank_enabled").default(true).notNull(),
    rerankTopN: integer("rerank_top_n").default(30).notNull(),
    rerankKeepN: integer("rerank_keep_n").default(10).notNull(),
    vectorWeight: numeric("vector_weight", { precision: 3, scale: 2 }).default("0.50").notNull(),
    ftsWeight: numeric("fts_weight", { precision: 3, scale: 2 }).default("0.30").notNull(),
    kiWeight: numeric("ki_weight", { precision: 3, scale: 2 }).default("0.20").notNull(),
    ...timestamps(),
  },
  (table) => [uniqueIndex("retrieval_settings_knowledge_base_uidx").on(table.knowledgeBaseId)],
);

export const metadataFields = pgTable(
  "metadata_fields",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    name: varchar("name", { length: 80 }).notNull(),
    type: metadataFieldTypeEnum("type").notNull(),
    required: boolean("required").default(false).notNull(),
    filterable: boolean("filterable").default(true).notNull(),
    options: jsonb("options").default([]).notNull(),
    ...createdOnly(),
  },
  (table) => [index("metadata_fields_knowledge_base_idx").on(table.knowledgeBaseId)],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storagePath: text("storage_path").notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileType: varchar("file_type", { length: 80 }).notNull(),
    fileSize: bigint("file_size", { mode: "number" }).notNull(),
    hash: varchar("hash", { length: 128 }).notNull(),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    ...createdOnly(),
  },
  (table) => [index("files_uploader_idx").on(table.uploaderId)],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    title: varchar("title", { length: 255 }).notNull(),
    sourceType: documentSourceTypeEnum("source_type").notNull(),
    sourceUri: text("source_uri"),
    fileId: uuid("file_id").references(() => files.id),
    fileType: varchar("file_type", { length: 80 }),
    fileSize: bigint("file_size", { mode: "number" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id),
    processStatus: processStatusEnum("process_status").default("pending").notNull(),
    parseStatus: processStatusEnum("parse_status").default("pending").notNull(),
    chunkStatus: processStatusEnum("chunk_status").default("pending").notNull(),
    embeddingStatus: embeddingStatusEnum("embedding_status").default("pending").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    errorMessage: text("error_message"),
    ...timestamps(),
  },
  (table) => [
    index("documents_knowledge_base_idx").on(table.knowledgeBaseId),
    index("documents_process_status_idx").on(table.processStatus),
  ],
);

export const documentTags = pgTable(
  "document_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("document_tags_document_tag_uidx").on(table.documentId, table.tagId),
    index("document_tags_document_idx").on(table.documentId),
    index("document_tags_tag_idx").on(table.tagId),
  ],
);

export const parentChunks = pgTable(
  "parent_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    title: varchar("title", { length: 255 }),
    content: text("content").notNull(),
    headingPath: jsonb("heading_path").default([]).notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    metadata: jsonb("metadata").default({}).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("parent_chunks_document_idx").on(table.documentId),
    index("parent_chunks_knowledge_base_idx").on(table.knowledgeBaseId),
  ],
);

export const childChunks = pgTable(
  "child_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    parentChunkId: uuid("parent_chunk_id")
      .notNull()
      .references(() => parentChunks.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    content: text("content").notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    tokenCount: integer("token_count"),
    metadata: jsonb("metadata").default({}).notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    searchVector: tsvector("search_vector"),
    embeddingStatus: embeddingStatusEnum("embedding_status").default("pending").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("child_chunks_parent_idx").on(table.parentChunkId),
    index("child_chunks_document_idx").on(table.documentId),
    index("child_chunks_knowledge_base_idx").on(table.knowledgeBaseId),
    index("child_chunks_embedding_hnsw_idx").using("hnsw", table.embedding.op("vector_cosine_ops")),
    index("child_chunks_search_vector_gin_idx").using("gin", table.searchVector),
  ],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    summary: text("summary"),
    sourceDocumentId: uuid("source_document_id").references(() => documents.id, {
      onDelete: "cascade",
    }),
    status: knowledgeItemStatusEnum("status").default("draft").notNull(),
    metadata: jsonb("metadata").default({}).notNull(),
    embedding: vector("embedding", { dimensions: 1024 }),
    searchVector: tsvector("search_vector"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by").references(() => users.id),
    verifiedBy: uuid("verified_by").references(() => users.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    viewCount: integer("view_count").default(0).notNull(),
    citeCount: integer("cite_count").default(0).notNull(),
    likeCount: integer("like_count").default(0).notNull(),
    dislikeCount: integer("dislike_count").default(0).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_items_knowledge_base_idx").on(table.knowledgeBaseId),
    index("knowledge_items_source_document_idx").on(table.sourceDocumentId),
    index("knowledge_items_status_idx").on(table.status),
    index("knowledge_items_embedding_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
    index("knowledge_items_search_vector_gin_idx").using("gin", table.searchVector),
  ],
);

export const knowledgeItemTags = pgTable(
  "knowledge_item_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("knowledge_item_tags_item_tag_uidx").on(table.knowledgeItemId, table.tagId),
    index("knowledge_item_tags_item_idx").on(table.knowledgeItemId),
    index("knowledge_item_tags_tag_idx").on(table.tagId),
  ],
);

export const knowledgeMapNodes = pgTable(
  "knowledge_map_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id").references((): AnyPgColumn => knowledgeMapNodes.id, {
      onDelete: "cascade",
    }),
    type: varchar("type", { length: 30 })
      .$type<"kb" | "document" | "knowledge_item" | "topic">()
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    referenceId: uuid("reference_id"),
    sortOrder: integer("sort_order").default(0).notNull(),
    status: varchar("status", { length: 20 })
      .$type<"draft" | "published">()
      .default("draft")
      .notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_map_nodes_kb_idx").on(table.knowledgeBaseId),
    index("knowledge_map_nodes_parent_idx").on(table.parentId),
    index("knowledge_map_nodes_status_idx").on(table.knowledgeBaseId, table.status),
  ],
);

export const knowledgeItemFeedback = pgTable(
  "knowledge_item_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeItemId: uuid("knowledge_item_id")
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    rating: knowledgeItemFeedbackRatingEnum("rating").notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("knowledge_item_feedback_item_user_uidx").on(table.knowledgeItemId, table.userId),
    index("knowledge_item_feedback_user_idx").on(table.userId),
  ],
);

export const knowledgeImprovementTasks = pgTable(
  "knowledge_improvement_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    triggerType: improvementTriggerTypeEnum("trigger_type").notNull(),
    sourceMessageId: uuid("source_message_id").references(() => conversationMessages.id),
    sourceFeedbackId: uuid("source_feedback_id"),
    sourceQuestion: text("source_question").notNull(),
    sourceContext: jsonb("source_context").default({}).notNull(),
    status: improvementTaskStatusEnum("status").default("pending").notNull(),
    candidateTitle: text("candidate_title"),
    candidateContent: text("candidate_content"),
    candidateSummary: text("candidate_summary"),
    candidateMetadata: jsonb("candidate_metadata").default({}).notNull(),
    aiConfidence: real("ai_confidence"),
    aiReasoning: text("ai_reasoning"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    publishedItemId: uuid("published_item_id").references(() => knowledgeItems.id, {
      onDelete: "cascade",
    }),
    verificationStatus: verificationStatusEnum("verification_status"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    dedupKey: varchar("dedup_key", { length: 255 }),
    ...timestamps(),
  },
  (table) => [
    index("knowledge_improvement_tasks_kb_status_idx").on(table.knowledgeBaseId, table.status),
    index("knowledge_improvement_tasks_trigger_idx").on(table.triggerType),
    index("knowledge_improvement_tasks_published_item_idx").on(table.publishedItemId),
    uniqueIndex("knowledge_improvement_tasks_dedup_uidx").on(table.dedupKey),
  ],
);

export const knowledgeImprovementScanCursors = pgTable(
  "knowledge_improvement_scan_cursors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    sourceType: varchar("source_type", { length: 40 }).notNull(),
    lastSourceCreatedAt: timestamp("last_source_created_at", { withTimezone: true }),
    lastSourceId: uuid("last_source_id"),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("knowledge_improvement_scan_cursors_kb_source_uidx").on(
      table.knowledgeBaseId,
      table.sourceType,
    ),
    index("knowledge_improvement_scan_cursors_kb_idx").on(table.knowledgeBaseId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    avatar: text("avatar"),
    type: agentTypeEnum("type").notNull(),
    ownerId: uuid("owner_id").references(() => users.id),
    systemPrompt: text("system_prompt"),
    openingMessage: text("opening_message"),
    recommendedQuestions: jsonb("recommended_questions").default([]).notNull(),
    answerStyle: varchar("answer_style", { length: 80 }),
    fallbackStrategy: text("fallback_strategy"),
    allowAttachments: boolean("allow_attachments").default(true).notNull(),
    forceCitation: boolean("force_citation").default(true).notNull(),
    visibility: agentVisibilityEnum("visibility").notNull(),
    status: agentStatusEnum("status").default("draft").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    modelProvider: varchar("model_provider", { length: 120 }),
    modelName: varchar("model_name", { length: 120 }),
    modelConfig: jsonb("model_config").default({}).notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [
    index("agents_type_idx").on(table.type),
    index("agents_owner_idx").on(table.ownerId),
    index("agents_status_idx").on(table.status),
  ],
);

export const agentKnowledgeBases = pgTable(
  "agent_knowledge_bases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    knowledgeBaseId: uuid("knowledge_base_id")
      .notNull()
      .references(() => knowledgeBases.id),
    ...createdOnly(),
  },
  (table) => [
    uniqueIndex("agent_knowledge_bases_agent_kb_uidx").on(table.agentId, table.knowledgeBaseId),
  ],
);

export const modelProviders = pgTable("model_providers", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 120 }).notNull(),
  providerType: modelProviderTypeEnum("provider_type").notNull(),
  baseUrl: text("base_url").notNull(),
  encryptedApiKey: text("encrypted_api_key"),
  enabled: boolean("enabled").default(true).notNull(),
  timeoutMs: integer("timeout_ms").default(30000).notNull(),
  retryCount: integer("retry_count").default(2).notNull(),
  concurrencyLimit: integer("concurrency_limit").default(5).notNull(),
  dailyQuota: integer("daily_quota"),
  remark: text("remark"),
  ...timestamps(),
});

export const modelCatalog = pgTable(
  "model_catalog",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    providerId: uuid("provider_id")
      .notNull()
      .references(() => modelProviders.id),
    modelName: varchar("model_name", { length: 160 }).notNull(),
    modelType: modelTypeEnum("model_type").notNull(),
    contextWindow: integer("context_window"),
    supportsStreaming: boolean("supports_streaming").default(false).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    ...timestamps(),
  },
  (table) => [
    uniqueIndex("model_catalog_provider_model_uidx").on(table.providerId, table.modelName),
  ],
);

export const modelUsagePolicies = pgTable(
  "model_usage_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usageType: modelUsageTypeEnum("usage_type").notNull(),
    defaultModelId: uuid("default_model_id").references(() => modelCatalog.id),
    fallbackModelId: uuid("fallback_model_id").references(() => modelCatalog.id),
    enabled: boolean("enabled").default(true).notNull(),
    temperature: real("temperature").default(0.7).notNull(),
    maxOutputTokens: integer("max_output_tokens"),
    timeoutMs: integer("timeout_ms").default(30000).notNull(),
    retryCount: integer("retry_count").default(2).notNull(),
    quota: integer("quota"),
    ...timestamps(),
  },
  (table) => [uniqueIndex("model_usage_policies_usage_type_uidx").on(table.usageType)],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    title: varchar("title", { length: 255 }).notNull(),
    status: conversationStatusEnum("status").default("active").notNull(),
    pinned: boolean("pinned").default(false).notNull(),
    favorited: boolean("favorited").default(false).notNull(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    ...timestamps(),
  },
  (table) => [index("conversations_user_agent_idx").on(table.userId, table.agentId)],
);

export const conversationMessages = pgTable(
  "conversation_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    confidenceLevel: confidenceLevelEnum("confidence_level"),
    noAnswerType: noAnswerTypeEnum("no_answer_type"),
    usedContext: jsonb("used_context").default([]).notNull(),
    ...createdOnly(),
  },
  (table) => [index("conversation_messages_conversation_idx").on(table.conversationId)],
);

export const messageCitations = pgTable(
  "message_citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id),
    sourceType: citationSourceTypeEnum("source_type").notNull(),
    knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    knowledgeItemId: uuid("knowledge_item_id").references(() => knowledgeItems.id, {
      onDelete: "set null",
    }),
    attachmentId: uuid("attachment_id"),
    chunkId: uuid("chunk_id"),
    title: varchar("title", { length: 255 }).notNull(),
    snippet: text("snippet"),
    pageOrSection: varchar("page_or_section", { length: 120 }),
    ...createdOnly(),
  },
  (table) => [
    index("message_citations_message_idx").on(table.messageId),
    index("message_citations_document_idx").on(table.documentId),
    index("message_citations_knowledge_item_idx").on(table.knowledgeItemId),
  ],
);

export const answerFeedback = pgTable(
  "answer_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    messageId: uuid("message_id")
      .notNull()
      .references(() => conversationMessages.id),
    rating: feedbackRatingEnum("rating").notNull(),
    reason: varchar("reason", { length: 120 }),
    correctionContent: text("correction_content"),
    suggestedSource: text("suggested_source"),
    suggestedIngestion: boolean("suggested_ingestion").default(false).notNull(),
    ...createdOnly(),
  },
  (table) => [index("answer_feedback_message_idx").on(table.messageId)],
);

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    eventType: analyticsEventTypeEnum("event_type").notNull(),
    targetType: analyticsTargetTypeEnum("target_type"),
    targetId: uuid("target_id"),
    knowledgeBaseId: uuid("knowledge_base_id").references(() => knowledgeBases.id),
    sessionId: varchar("session_id", { length: 160 }),
    agentId: uuid("agent_id").references(() => agents.id),
    durationMs: integer("duration_ms"),
    metadata: jsonb("metadata").default({}).notNull(),
    createdDate: date("created_date").defaultNow().notNull(),
    ...createdOnly(),
  },
  (table) => [
    index("analytics_events_event_type_idx").on(table.eventType),
    index("analytics_events_knowledge_base_date_idx").on(table.knowledgeBaseId, table.createdDate),
    index("analytics_events_user_date_idx").on(table.userId, table.createdDate),
    index("analytics_events_agent_date_idx").on(table.agentId, table.createdDate),
  ],
);

export const agentRuntimeTraces = pgTable(
  "agent_runtime_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id),
    conversationId: uuid("conversation_id").references(() => conversations.id),
    messageId: uuid("message_id").references(() => conversationMessages.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    graphVersion: varchar("graph_version", { length: 80 }).notNull(),
    stateSnapshot: jsonb("state_snapshot").default({}).notNull(),
    steps: jsonb("steps").default([]).notNull(),
    retrievedContext: jsonb("retrieved_context").default([]).notNull(),
    promptSnapshot: text("prompt_snapshot"),
    modelConfig: jsonb("model_config").default({}).notNull(),
    citations: jsonb("citations").default([]).notNull(),
    confidenceLevel: confidenceLevelEnum("confidence_level"),
    noAnswerType: noAnswerTypeEnum("no_answer_type"),
    latencyMs: integer("latency_ms"),
    error: text("error"),
    ...createdOnly(),
  },
  (table) => [index("agent_runtime_traces_agent_idx").on(table.agentId)],
);

export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobType: varchar("job_type", { length: 120 }).notNull(),
    targetType: varchar("target_type", { length: 120 }).notNull(),
    targetId: uuid("target_id"),
    status: backgroundJobStatusEnum("status").default("pending").notNull(),
    progress: integer("progress").default(0).notNull(),
    errorMessage: text("error_message"),
    retryCount: integer("retry_count").default(0).notNull(),
    ...timestamps(),
  },
  (table) => [
    index("background_jobs_target_idx").on(table.targetType, table.targetId),
    index("background_jobs_status_idx").on(table.status),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").references(() => users.id),
    knowledgeBaseId: uuid("knowledge_base_id"),
    action: varchar("action", { length: 160 }).notNull(),
    targetType: varchar("target_type", { length: 120 }).notNull(),
    targetId: uuid("target_id"),
    result: varchar("result", { length: 80 }).notNull(),
    detail: jsonb("detail").default({}).notNull(),
    ip: varchar("ip", { length: 80 }),
    userAgent: text("user_agent"),
    ...createdOnly(),
  },
  (table) => [
    index("audit_logs_knowledge_base_idx").on(table.knowledgeBaseId, table.createdAt),
    index("audit_logs_target_idx").on(table.targetType, table.targetId),
  ],
);
