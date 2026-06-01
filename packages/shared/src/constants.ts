export const APP_NAME = "Knowflow";

export const API_PREFIX = "/api";

export const HEALTH_ENDPOINT = "/health";

export const SESSION_COOKIE_NAME = "knowflow_session";

export const ACCESS_SESSION_COOKIE_NAME = "knowflow_access";

export const REFRESH_SESSION_COOKIE_NAME = "knowflow_refresh";

export const DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";

export const DEFAULT_EMBEDDING_DIMENSION = 1024;

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

export const KNOWLEDGE_BASE_VISIBILITIES = ["public", "department", "restricted"] as const;

export const KNOWLEDGE_BASE_STATUSES = ["active", "disabled", "archived"] as const;

export const KNOWLEDGE_BASE_INDEX_STATUSES = [
  "not_indexed",
  "indexing",
  "ready",
  "partial_failed",
  "failed",
] as const;

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
