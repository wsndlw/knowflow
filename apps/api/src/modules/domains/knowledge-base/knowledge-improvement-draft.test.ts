import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseDocumentDraftResponse, parseDraftResponse } from "./knowledge-improvement-draft.js";

const parseContext = {
  triggerType: "document_extraction" as const,
  sourceDocumentId: "doc-1",
  sourceContext: {
    documentTitle: "员工手册",
    chunkId: "chunk-1",
    chunkIndex: 3,
  },
};

void describe("knowledge improvement draft parsing", () => {
  void it("parses multiple document knowledge points from an items array", () => {
    const drafts = parseDocumentDraftResponse(
      JSON.stringify({
        items: [
          {
            title: "差旅报销时限",
            content: "差旅报销需要在出差结束后 30 天内提交。",
            summary: "出差后 30 天内报销",
            confidence: 0.93,
            reasoning: "文档明确写出时限。",
          },
          {
            title: "发票要求",
            content: "报销必须提供真实、完整、可验真的发票。",
            summary: null,
            confidence: 1.2,
            reasoning: "文档列出发票要求。",
          },
        ],
      }),
      parseContext,
    );

    assert.equal(drafts.length, 2);
    const first = drafts[0];
    const second = drafts[1];
    assert.ok(first);
    assert.ok(second);
    assert.equal(first.title, "差旅报销时限");
    assert.equal(first.metadata["sourceDocumentId"], "doc-1");
    assert.equal(first.metadata["documentKnowledgeIndex"], 0);
    assert.equal(second.confidence, 1);
    assert.equal(second.summary, null);
  });

  void it("still parses legacy single-object draft responses", () => {
    const draft = parseDraftResponse(
      JSON.stringify({
        title: "低置信问题",
        content: "需要补充知识条目。",
        summary: "",
        confidence: -0.5,
        reasoning: "",
      }),
      { ...parseContext, sourceDocumentId: null },
    );

    assert.equal(draft.summary, null);
    assert.equal(draft.confidence, 0);
    assert.equal(draft.metadata["improvementSource"], "feedback");
  });
});
