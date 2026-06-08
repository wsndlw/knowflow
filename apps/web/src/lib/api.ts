import {
  apiFailureSchema,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  retrievalTestResponseSchema,
  SECURE_CSRF_COOKIE_NAME,
  tagListResponseSchema,
  tagSchema,
  type CreateTagRequest,
  type KnowledgeTag,
  type ReplaceTagsRequest,
  type RetrievalTestRequest,
  type RetrievalTestResponse,
  type TagListResponse,
  type UpdateTagRequest,
} from "@knowflow/shared";

export const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000";

type ParsableSchema<T> = {
  parse: (input: unknown) => T;
};

export const emptyObjectSchema: ParsableSchema<Record<string, never>> = {
  parse(input: unknown): Record<string, never> {
    if (typeof input === "object" && input !== null && Object.keys(input).length === 0) {
      return {};
    }
    throw new Error("响应格式无效");
  },
};

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export function getCsrfToken(): string {
  if (typeof document === "undefined") {
    return "";
  }

  const cookies = document.cookie
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    try {
      const name = separator === -1 ? cookie : decodeURIComponent(cookie.slice(0, separator));
      if (name === SECURE_CSRF_COOKIE_NAME || name === CSRF_COOKIE_NAME) {
        return separator === -1 ? "" : decodeURIComponent(cookie.slice(separator + 1));
      }
    } catch {
      continue;
    }
  }

  return "";
}

function isStateChangingMethod(method: string | undefined): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes((method ?? "GET").toUpperCase());
}

export async function parseApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = apiFailureSchema.safeParse(body);
    return parsed.success ? parsed.data.error.message : "请求失败";
  } catch {
    return "请求失败";
  }
}

// 刷新「单飞 + 短期成功缓存」：
// - 单飞：并发的 401 共用同一个在途刷新 Promise。
// - 短期成功缓存：一次刷新成功后的 REFRESH_SUCCESS_TTL_MS 窗口内，后续 401 直接复用上次成功结果，
//   不再发起新的 /auth/refresh。后端的 refresh token 轮换 + 复用检测会因「顺序双刷新」用到已轮换的旧 token 而吊销整条会话；
//   深层页冷加载是「第1波请求→刷新成功→清锁→第2波请求稍后才 401→第二次刷新带旧 token」的顺序模式，故必跳登录。
//   缓存成功结果可消除这次多余的第二次刷新。失败不缓存（要让下一次 401 真正重试刷新）。
const REFRESH_SUCCESS_TTL_MS = 5000;

let refreshPromise: Promise<boolean> | null = null;
let lastRefreshSuccessAt = 0;

async function doRefreshAccess(): Promise<boolean> {
  try {
    const response = await fetch(apiUrl("/auth/refresh"), {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function refreshAccess(): Promise<boolean> {
  // 窗口内刚成功刷新过 → 复用成功结果，不再发 /auth/refresh（避免顺序双刷新触发后端复用检测）。
  if (lastRefreshSuccessAt > 0 && Date.now() - lastRefreshSuccessAt < REFRESH_SUCCESS_TTL_MS) {
    return true;
  }
  if (refreshPromise) {
    return refreshPromise;
  }
  refreshPromise = doRefreshAccess()
    .then((ok) => {
      // 仅缓存成功；失败不记时间戳，让后续 401 仍能真正重试。
      lastRefreshSuccessAt = ok ? Date.now() : 0;
      return ok;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

// 登出 / 鉴权失败时调用：清掉成功缓存，避免登出后窗口内的 401 被误判为「已刷新」。
export function resetRefreshState(): void {
  lastRefreshSuccessAt = 0;
  refreshPromise = null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiRequest<TData>(
  path: string,
  dataSchema: ParsableSchema<TData>,
  init?: RequestInit,
): Promise<TData> {
  const headers = new Headers(init?.headers);
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  if (init?.body !== undefined && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (isStateChangingMethod(init?.method) && !headers.has(CSRF_HEADER_NAME)) {
    headers.set(CSRF_HEADER_NAME, getCsrfToken());
  }

  let response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 401) {
    const refreshed = await refreshAccess();
    if (refreshed) {
      if (isStateChangingMethod(init?.method)) {
        headers.set(CSRF_HEADER_NAME, getCsrfToken());
      }
      response = await fetch(apiUrl(path), {
        ...init,
        credentials: "include",
        headers,
      });
    } else {
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
  }

  if (!response.ok) {
    throw new ApiError(await parseApiError(response), response.status);
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== true ||
    !("data" in body)
  ) {
    throw new Error("响应格式无效");
  }

  return dataSchema.parse(body.data);
}

// ──────────────────────────────────────────────────────────────
// 检索测试
// ──────────────────────────────────────────────────────────────

export function retrievalTest(
  knowledgeBaseId: string,
  body: RetrievalTestRequest,
): Promise<RetrievalTestResponse> {
  return apiRequest(`/knowledge-bases/${knowledgeBaseId}/retrieval-test`, retrievalTestResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ──────────────────────────────────────────────────────────────
// 标签：CRUD + 打标签（全量替换）
// ──────────────────────────────────────────────────────────────

export function listKnowledgeBaseTags(knowledgeBaseId: string): Promise<TagListResponse> {
  return apiRequest(`/knowledge-bases/${knowledgeBaseId}/tags`, tagListResponseSchema, {
    cache: "no-store",
  });
}

export function createKnowledgeBaseTag(
  knowledgeBaseId: string,
  body: CreateTagRequest,
): Promise<KnowledgeTag> {
  return apiRequest(`/knowledge-bases/${knowledgeBaseId}/tags`, tagSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateTag(tagId: string, body: UpdateTagRequest): Promise<KnowledgeTag> {
  return apiRequest(`/tags/${tagId}`, tagSchema, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function deleteTag(tagId: string): Promise<Record<string, never>> {
  return apiRequest(`/tags/${tagId}`, emptyObjectSchema, { method: "DELETE" });
}

// PUT 全量替换：提交当前全部勾选的 tagId 数组，后端整体覆盖，返回更新后的标签列表
export function replaceDocumentTags(
  documentId: string,
  body: ReplaceTagsRequest,
): Promise<TagListResponse> {
  return apiRequest(`/documents/${documentId}/tags`, tagListResponseSchema, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function replaceKnowledgeItemTags(
  knowledgeItemId: string,
  body: ReplaceTagsRequest,
): Promise<TagListResponse> {
  return apiRequest(`/knowledge-items/${knowledgeItemId}/tags`, tagListResponseSchema, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}
