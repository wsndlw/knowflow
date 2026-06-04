export const APP_NAME = "Knowflow";

export const API_PREFIX = "/api";

export const HEALTH_ENDPOINT = "/health";

export const SESSION_COOKIE_NAME = "knowflow_session";

export const ACCESS_SESSION_COOKIE_NAME = "knowflow_access";

export const REFRESH_SESSION_COOKIE_NAME = "knowflow_refresh";

export const CSRF_COOKIE_NAME = "csrf";

export const SECURE_CSRF_COOKIE_NAME = "__Host-csrf";

export const CSRF_HEADER_NAME = "X-CSRF-Token";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";

export const DEFAULT_EMBEDDING_DIMENSION = 1024;

export const RETRIEVAL_MODES = [
  "hybrid",
  "hybrid_rerank",
  "vector_only",
  "fts_only",
  "ki_only",
] as const;

export const RETRIEVAL_TEST_MODES = ["default", ...RETRIEVAL_MODES] as const;

export const RETRIEVAL_SOURCE_TYPES = ["all", "chunk", "knowledge_item"] as const;

export const RETRIEVAL_DOCUMENT_STATUS_FILTERS = ["all", "completed"] as const;

export const RETRIEVAL_ITEM_STATUS_FILTERS = ["all", "published"] as const;

export enum AuditTargetType {
  USER = "user",
  DEPARTMENT = "department",
  KNOWLEDGE_BASE = "knowledge_base",
  DOCUMENT = "document",
  KNOWLEDGE_ITEM = "knowledge_item",
  AGENT = "agent",
  TAG = "tag",
  RETRIEVAL_SETTINGS = "retrieval_settings",
  MIND_MAP = "mind_map",
}

export const AUDIT_TARGET_TYPES = [
  AuditTargetType.USER,
  AuditTargetType.DEPARTMENT,
  AuditTargetType.KNOWLEDGE_BASE,
  AuditTargetType.DOCUMENT,
  AuditTargetType.KNOWLEDGE_ITEM,
  AuditTargetType.AGENT,
  AuditTargetType.TAG,
  AuditTargetType.RETRIEVAL_SETTINGS,
  AuditTargetType.MIND_MAP,
] as const;

export const AUDIT_RESULTS = ["success", "failure"] as const;

export const ACTION_LABELS: Record<string, string> = {
  "user.login": "用户登录",
  "user.logout": "用户登出",
  "user.department.assign": "设置用户部门",
  "department.create": "创建部门",
  "department.update": "更新部门",
  "department.delete": "删除部门",
  "department.member.add": "添加部门成员",
  "department.member.transfer": "转移部门成员",
  "kb.create": "创建知识库",
  "kb.update": "更新知识库",
  "kb.delete": "删除知识库",
  "kb.member.add": "添加成员",
  "kb.member.remove": "移除成员",
  "kb.admin.set": "设置管理员",
  "kb.admin.unset": "取消管理员",
  "document.upload": "上传文档",
  "document.delete": "删除文档",
  "document.reprocess": "重新处理文档",
  "knowledge_item.create": "创建知识条目",
  "knowledge_item.update": "更新知识条目",
  "knowledge_item.publish": "发布知识条目",
  "knowledge_item.unpublish": "下架知识条目",
  "knowledge_item.delete": "删除知识条目",
  "agent.create": "创建Agent",
  "agent.update": "更新Agent",
  "agent.publish": "发布Agent",
  "agent.delete": "删除Agent",
  "agent.generate": "生成Agent",
  "retrieval_settings.update": "更新检索设置",
  "tag.create": "创建标签",
  "tag.update": "更新标签",
  "tag.delete": "删除标签",
  "mind_map.generate": "生成思维导图",
  "mind_map.save": "保存思维导图",
  "mind_map.publish": "发布思维导图",
};

export const MIND_MAP_NODE_TYPES = ["kb", "document", "knowledge_item", "topic"] as const;

export const MIND_MAP_NODE_STATUSES = ["draft", "published"] as const;

export const MODEL_USAGE_TYPES = [
  "chat",
  "query_understanding",
  "document_processing",
  "embedding",
  "rerank",
  "ocr",
  "vision",
  "knowledge_production",
  "agent_generation",
] as const;

export const MODEL_PROVIDER_TYPES = [
  "openai",
  "azure_openai",
  "aliyun",
  "zhipu",
  "deepseek",
  "moonshot",
  "ollama",
  "openai_compatible",
] as const;

export const MODEL_TYPES = ["chat", "embedding", "rerank", "ocr", "vision", "moderation"] as const;

export const KNOWLEDGE_BASE_VISIBILITIES = ["public", "department", "restricted"] as const;

export const KNOWLEDGE_BASE_STATUSES = ["active", "disabled", "archived"] as const;

export const KNOWLEDGE_BASE_INDEX_STATUSES = [
  "not_indexed",
  "indexing",
  "ready",
  "partial_failed",
  "failed",
] as const;

export const KNOWLEDGE_ITEM_STATUSES = [
  "draft",
  "pending_review",
  "published",
  "unpublished",
  "expired",
] as const;

export const KNOWLEDGE_ITEM_FEEDBACK_RATINGS = ["like", "dislike"] as const;

export const PLATFORM_ROLES = ["super_admin", "department_admin", "user"] as const;

export const DOCUMENT_PROCESS_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "completed",
  "failed",
] as const;

export const DOCUMENT_SOURCE_TYPES = [
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
] as const;

export const AGENT_TYPES = ["global", "official", "personal"] as const;

export const AGENT_VISIBILITIES = [
  "global",
  "knowledge_base_members",
  "selected_members",
  "private",
] as const;

export const AGENT_STATUSES = ["draft", "published", "disabled", "archived"] as const;

export const CONFIDENCE_LEVELS = ["strong", "medium", "weak", "not_found"] as const;

export const NO_ANSWER_TYPES = [
  "no_answer",
  "low_confidence",
  "knowledge_gap",
  "permission_limited",
  "attachment_parse_failed",
] as const;

export const CITATION_SOURCE_TYPES = [
  "knowledge_document",
  "knowledge_item",
  "conversation_attachment",
] as const;

export const FEEDBACK_RATINGS = ["useful", "not_useful", "correction"] as const;

export const IMPROVEMENT_TRIGGER_TYPES = [
  "no_answer",
  "low_confidence",
  "knowledge_gap",
  "user_correction",
  "answer_dislike",
  "item_dislike",
  "document_extraction",
] as const;

export const IMPROVEMENT_TASK_STATUSES = [
  "pending",
  "processing",
  "candidate_ready",
  "approved",
  "rejected",
  "published",
  "failed",
] as const;

export const VERIFICATION_STATUSES = ["pending", "verified", "still_failing", "expired"] as const;

export const ANALYTICS_EVENT_TYPES = [
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
] as const;

export const ANALYTICS_TARGET_TYPES = [
  "knowledge_base",
  "document",
  "knowledge_item",
  "agent",
  "message",
  "conversation",
  "citation",
  "attachment",
] as const;
