import { apiFailureSchema } from "@knowflow/shared";

export const API_BASE_URL = process.env["NEXT_PUBLIC_API_BASE_URL"] ?? "http://localhost:4000";

type ParsableSchema<T> = {
  parse: (input: unknown) => T;
};

export function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

export async function parseApiError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = apiFailureSchema.safeParse(body);
    return parsed.success ? parsed.data.error.message : "Request failed";
  } catch {
    return "Request failed";
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

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: "include",
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseApiError(response));
  }

  const body: unknown = await response.json();
  if (
    typeof body !== "object" ||
    body === null ||
    !("ok" in body) ||
    body.ok !== true ||
    !("data" in body)
  ) {
    throw new Error("Invalid API response");
  }

  return dataSchema.parse(body.data);
}
