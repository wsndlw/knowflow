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

const MAX_DOCUMENT_DRAFT_CONTENT_LENGTH = 4000;
const SUMMARY_STYLE_PREFIXES = [
  "本文主要介绍",
  "本文主要讲述",
  "本文总结",
  "总结如下",
  "该文档描述",
  "该文档主要",
  "文档主要介绍",
  "文档描述",
  "this document describes",
  "this document mainly",
  "the document describes",
  "the document mainly",
];

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
  const drafts: CandidateDraft[] = [];
  for (let index = 0; index < draftValues.length; index += 1) {
    const item = draftValues[index];
    if (item === undefined) {
      continue;
    }
    try {
      drafts.push(parseDraftObject(item, context, index + 1));
    } catch {
      continue;
    }
  }
  if (drafts.length === 0) {
    throw new Error("LLM returned no valid document knowledge points");
  }
  return drafts;
}

export function filterDocumentDrafts(drafts: CandidateDraft[]): CandidateDraft[] {
  const seen = new Set<string>();
  const filtered: CandidateDraft[] = [];
  for (const draft of drafts) {
    if (draft.title.trim().length === 0 || draft.content.trim().length === 0) {
      continue;
    }
    if (draft.content.length > MAX_DOCUMENT_DRAFT_CONTENT_LENGTH) {
      continue;
    }
    if (isSummaryStyleDraft(draft)) {
      continue;
    }

    const duplicateKey = normalizeDraftDuplicateKey(draft);
    if (seen.has(duplicateKey)) {
      continue;
    }
    seen.add(duplicateKey);
    filtered.push({
      ...draft,
      metadata: {
        ...draft.metadata,
        documentKnowledgeIndex: filtered.length + 1,
      },
    });
  }
  return filtered;
}

export function buildPublishedKnowledgeMetadata(input: {
  taskId: string;
  sourceDocumentId: string | null;
  candidateMetadata: Record<string, unknown>;
  sourceContext: Record<string, unknown>;
}): Record<string, unknown> {
  const improvementSource = input.sourceDocumentId === null ? "feedback" : "document";
  const metadata: Record<string, unknown> = {
    ...input.candidateMetadata,
    source: "ai_generated",
    improvementSource,
    improvementTaskId: input.taskId,
    sourceDocumentId: input.sourceDocumentId,
  };

  copyMetadataValue(metadata, input.sourceContext, "documentTitle");
  copyMetadataValue(metadata, input.sourceContext, "chunkId", "sourceChunkId");
  copyMetadataValue(metadata, input.sourceContext, "chunkIndex", "sourceChunkIndex");
  copyMetadataValue(metadata, input.sourceContext, "documentKnowledgeIndex");
  addSourceTextExcerpt(metadata, input.sourceContext);
  return metadata;
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
  const sourceEvidence = draftSourceEvidence(parsed);
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
      ...(sourceEvidence === null
        ? {}
        : { sourceEvidence, sourceTextExcerpt: sourceEvidence }),
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

function draftSourceEvidence(parsed: Record<string, unknown>): string | null {
  const value = parsed["sourceEvidence"] ?? parsed["sourceTextExcerpt"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 1000) : null;
}

function isSummaryStyleDraft(draft: CandidateDraft): boolean {
  const title = draft.title.trim().toLowerCase();
  const content = draft.content.trim().toLowerCase();
  return SUMMARY_STYLE_PREFIXES.some(
    (prefix) => title.startsWith(prefix.toLowerCase()) || content.startsWith(prefix.toLowerCase()),
  );
}

function normalizeDraftDuplicateKey(draft: CandidateDraft): string {
  return `${draft.title}\n${draft.content}`.toLowerCase().replace(/\s+/g, "");
}

function copyMetadataValue(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  sourceKey: string,
  targetKey = sourceKey,
): void {
  if (target[targetKey] !== undefined) {
    return;
  }
  const value = source[sourceKey];
  if (value !== undefined && value !== null) {
    target[targetKey] = value;
  }
}

function addSourceTextExcerpt(
  metadata: Record<string, unknown>,
  sourceContext: Record<string, unknown>,
): void {
  if (metadata["sourceEvidence"] !== undefined || metadata["sourceTextExcerpt"] !== undefined) {
    return;
  }
  const text = sourceContext["text"];
  if (typeof text !== "string" || text.trim().length === 0) {
    return;
  }
  const excerpt = text.trim().replace(/\s+/g, " ").slice(0, 1000);
  metadata["sourceEvidence"] = excerpt;
  metadata["sourceTextExcerpt"] = excerpt;
}
