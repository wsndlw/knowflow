import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import { RetrievalService } from "./retrieval.service.js";
import type { RetrievalSettingsService } from "./retrieval-settings.service.js";

type RecallDocumentRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string;
  childChunkId: string;
  parentChunkId: string;
  title: string;
  content: string;
  parentTitle: string | null;
  parentContent: string;
  headingPath: unknown;
  pageStart: number | null;
  pageEnd: number | null;
  chunkIndex: number;
  tokenCount: number | null;
  createdAt: Date;
  pageOrSection: string | null;
  score: number;
};

type RecallKnowledgeItemRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  knowledgeItemId: string;
  title: string;
  content: string;
  summary: string | null;
  createdBy: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  status: "draft" | "pending_review" | "published" | "unpublished" | "expired";
  viewCount: number;
  citeCount: number;
  likeCount: number;
  createdAt: Date;
  score: number;
};

class FailingRerankLlmService extends AliyunLlmService {
  override embedTexts(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map(() => [0.1, 0.2, 0.3]));
  }

  override rerank(): Promise<never> {
    return Promise.reject(new Error("rerank service unavailable"));
  }
}

const unusedRetrievalSettings = {} as RetrievalSettingsService;

void describe("RetrievalService.retrieve", () => {
  void it("falls back to initial ranking when rerank fails", async () => {
    const service = new RetrievalService(new FailingRerankLlmService(), unusedRetrievalSettings);
    Object.assign(service as object, {
      recallVector: (): Promise<RecallDocumentRow[]> =>
        Promise.resolve([
          makeDocumentRow({
            childChunkId: "chunk-low",
            parentChunkId: "parent-low",
            content: "Lower scoring vector candidate",
            parentContent: "Lower scoring vector candidate parent context",
            score: 0.31,
          }),
          makeDocumentRow({
            childChunkId: "chunk-high",
            parentChunkId: "parent-high",
            content: "Higher scoring vector candidate",
            parentContent: "Higher scoring vector candidate parent context",
            score: 0.89,
          }),
        ]),
      recallFts: (): Promise<RecallDocumentRow[]> => Promise.resolve([]),
      recallKnowledgeItems: (): Promise<RecallKnowledgeItemRow[]> =>
        Promise.resolve([
          makeKnowledgeItemRow({
            knowledgeItemId: "ki-middle",
            content: "Middle scoring knowledge item",
            score: 0.62,
          }),
        ]),
    });

    const result = await service.retrieve({
      query: "How does rerank fallback work?",
      allowedKnowledgeBaseIds: ["kb-1"],
    });

    assert.deepEqual(
      result.candidates.map((candidate) => candidate.id),
      ["parent-high", "ki-middle", "parent-low"],
    );
    assert.equal(result.contexts.length, 3);
    assert.deepEqual(
      result.contexts.map((context) => context.citationIndex),
      [1, 2, 3],
    );
    assert.equal(result.candidates[0]?.rerankScore, null);
    assert.equal(result.trace.recalled.vector, 2);
    assert.equal(result.trace.recalled.knowledgeItem, 1);
    assert.equal(result.trace.reranked, 3);
    assert.equal(result.trace.final, 3);
  });
});

function makeDocumentRow(overrides: {
  childChunkId: string;
  parentChunkId: string;
  content: string;
  parentContent: string;
  score: number;
}): RecallDocumentRow {
  return {
    id: overrides.childChunkId,
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "Knowledge Base",
    documentId: "doc-1",
    childChunkId: overrides.childChunkId,
    parentChunkId: overrides.parentChunkId,
    title: "Document title",
    content: overrides.content,
    parentTitle: "Parent title",
    parentContent: overrides.parentContent,
    headingPath: null,
    pageStart: null,
    pageEnd: null,
    chunkIndex: 1,
    tokenCount: null,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    pageOrSection: "Parent title",
    score: overrides.score,
  };
}

function makeKnowledgeItemRow(overrides: {
  knowledgeItemId: string;
  content: string;
  score: number;
}): RecallKnowledgeItemRow {
  return {
    id: overrides.knowledgeItemId,
    knowledgeBaseId: "kb-1",
    knowledgeBaseName: "Knowledge Base",
    knowledgeItemId: overrides.knowledgeItemId,
    title: "Knowledge item",
    content: overrides.content,
    summary: null,
    createdBy: "user-1",
    verifiedBy: "user-2",
    verifiedAt: new Date("2026-06-04T00:00:00.000Z"),
    status: "published",
    viewCount: 0,
    citeCount: 0,
    likeCount: 0,
    createdAt: new Date("2026-06-04T00:00:00.000Z"),
    score: overrides.score,
  };
}
