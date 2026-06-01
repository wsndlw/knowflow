export const APP_NAME = "Knowflow";

export const API_PREFIX = "/api";

export const HEALTH_ENDPOINT = "/health";

export const SESSION_COOKIE_NAME = "knowflow_session";

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

export const PLATFORM_ROLES = ["super_admin", "department_admin", "user"] as const;

export const DOCUMENT_PROCESS_STATUSES = [
  "pending",
  "parsing",
  "chunking",
  "embedding",
  "completed",
  "failed",
] as const;
