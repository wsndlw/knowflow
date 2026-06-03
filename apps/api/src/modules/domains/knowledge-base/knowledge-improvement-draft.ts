import type { ImprovementTriggerType } from "@knowflow/shared";

export type CandidateDraft = {
  title: string;
  content: string;
  summary: string | null;
  confidence: number | null;
  reasoning: string | null;
  metadata: Record<string, unknown>;
};

export type DraftParseContext = {
  triggerType: ImprovementTriggerType;
  sourceContext: Record<string, unknown>;
  sourceDocumentId: string | null;
};

export function parseDraftResponse(response: string, context: DraftParseContext): CandidateDraft {
  const parsed = parseJsonObject(response);
  return parseDraftObject(parsed, context);
}

export function parseDocumentDraftResponse(
  response: string,
  context: DraftParseContext,
): CandidateDraft[] {
  const parsed = parseJsonValue(response);
  const draftValues = normalizeDocumentDraftValues(parsed);
  if (draftValues.length === 0) {
    throw new Error("LLM returned no document knowledge points");
  }
  return draftValues.map((item, index) => parseDraftObject(item, context, index));
}

function normalizeDocumentDraftValues(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map((item) => assertRecord(item));
  }
  const record = assertRecord(parsed);
  const items = record["items"];
  if (Array.isArray(items)) {
    return items.map((item) => assertRecord(item));
  }
  return [record];
}

function parseDraftObject(
  parsed: Record<string, unknown>,
  context: DraftParseContext,
  documentKnowledgeIndex?: number,
): CandidateDraft {
  const title = requiredDraftString(parsed["title"], "title").slice(0, 255);
  const content = requiredDraftString(parsed["content"], "content").slice(0, 20000);
  const summaryValue = parsed["summary"];
  const confidenceValue = parsed["confidence"];
  return {
    title,
    content,
    summary:
      typeof summaryValue === "string" && summaryValue.trim().length > 0
        ? summaryValue.trim().slice(0, 2000)
        : null,
    confidence:
      typeof confidenceValue === "number" ? Math.max(0, Math.min(1, confidenceValue)) : null,
    reasoning: cleanString(parsed["reasoning"], "Generated from usage signals").slice(0, 2000),
    metadata: {
      source: "ai_generated",
      triggerType: context.triggerType,
      improvementSource: context.sourceDocumentId === null ? "feedback" : "document",
      sourceDocumentId: context.sourceDocumentId,
      documentTitle: context.sourceContext["documentTitle"],
      sourceChunkId: context.sourceContext["chunkId"],
      sourceChunkIndex: context.sourceContext["chunkIndex"],
      ...(documentKnowledgeIndex === undefined ? {} : { documentKnowledgeIndex }),
    },
  };
}

function parseJsonObject(value: string): Record<string, unknown> {
  return assertRecord(parseJsonValue(value));
}

function parseJsonValue(value: string): unknown {
  const trimmed = value.trim();
  const objectStart = trimmed.indexOf("{");
  const arrayStart = trimmed.indexOf("[");
  const startCandidates = [objectStart, arrayStart].filter((index) => index >= 0);
  const start = Math.min(...startCandidates);
  if (!Number.isFinite(start)) {
    throw new Error("LLM returned invalid JSON");
  }

  const firstChar = trimmed[start];
  const end = firstChar === "[" ? trimmed.lastIndexOf("]") : trimmed.lastIndexOf("}");
  if (end <= start) {
    throw new Error("LLM returned invalid JSON");
  }

  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  } catch {
    throw new Error("LLM returned invalid JSON");
  }
}

function assertRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("LLM returned non-object JSON");
  }
  return value as Record<string, unknown>;
}

function cleanString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function requiredDraftString(value: unknown, field: "title" | "content"): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`LLM draft missing required ${field}`);
  }
  return value.trim();
}
