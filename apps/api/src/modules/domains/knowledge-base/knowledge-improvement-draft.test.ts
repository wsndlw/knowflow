import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPublishedKnowledgeMetadata,
  filterDocumentDrafts,
  parseDocumentDraftResponse,
  parseDraftResponse,
} from "./knowledge-improvement-draft.js";

const parseContext = {
  triggerType: "document_extraction" as const,
  sourceDocumentId: "doc-1",
  sourceContext: {
    documentTitle: "员工手册",
    chunkId: "chunk-1",
    chunkIndex: 3,
    text: "差旅报销需要在出差结束后 30 天内提交。报销必须提供真实、完整、可验真的发票。",
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
    assert.equal(first.metadata["documentKnowledgeIndex"], 1);
    assert.equal(second.metadata["documentKnowledgeIndex"], 2);
    assert.equal(second.confidence, 1);
    assert.equal(second.summary, null);
  });

  void it("parses a legacy single document draft response as one item", () => {
    const drafts = parseDocumentDraftResponse(
      JSON.stringify({
        title: "保密材料存储规则",
        content: "保密材料必须存储在公司批准的知识库中。",
        confidence: 0.8,
      }),
      parseContext,
    );

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.metadata["documentKnowledgeIndex"], 1);
  });

  void it("skips invalid document draft items while keeping valid ones", () => {
    const drafts = parseDocumentDraftResponse(
      JSON.stringify({
        items: [
          {
            title: "",
            content: "缺标题的条目应该被跳过。",
          },
          {
            title: "报销提交期限",
            content: "差旅报销需要在出差结束后 30 天内提交。",
          },
        ],
      }),
      parseContext,
    );

    assert.equal(drafts.length, 1);
    assert.equal(drafts[0]?.title, "报销提交期限");
    assert.equal(drafts[0].metadata["documentKnowledgeIndex"], 2);
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

  void it("filters duplicate, summary-style, and overlong document drafts without dropping valid items", () => {
    const validDraft = parseDocumentDraftResponse(
      JSON.stringify({
        items: [
          {
            title: "本文主要介绍差旅制度",
            content: "本文主要介绍差旅申请、报销和发票要求。",
          },
          {
            title: "差旅申请审批要求",
            content: "员工出差前必须提交差旅申请，并获得直属主管审批。",
          },
          {
            title: "差旅申请审批要求",
            content: "员工出差前必须提交差旅申请，并获得直属主管审批。",
          },
          {
            title: "整段摘要",
            content: "报销".repeat(3000),
          },
          {
            title: "发票验真要求",
            content: "报销发票必须真实、完整，并可通过官方渠道验真。",
          },
        ],
      }),
      parseContext,
    );

    const filtered = filterDocumentDrafts(validDraft);

    assert.deepEqual(
      filtered.map((draft) => draft.title),
      ["差旅申请审批要求", "发票验真要求"],
    );
    assert.deepEqual(
      filtered.map((draft) => draft.metadata["documentKnowledgeIndex"]),
      [1, 2],
    );
  });

  void it("fails clearly when quality filters reject every document draft", () => {
    const summaryDrafts = parseDocumentDraftResponse(
      JSON.stringify({
        items: [
          {
            title: "本文主要介绍差旅制度",
            content: "本文主要介绍差旅申请、报销和发票要求。",
          },
        ],
      }),
      parseContext,
    );

    assert.throws(
      () => filterDocumentDrafts(summaryDrafts),
      /quality filter rejected all candidates/,
    );
  });

  void it("builds published metadata with candidate source fields and source evidence", () => {
    const metadata = buildPublishedKnowledgeMetadata({
      taskId: "task-1",
      sourceDocumentId: "doc-1",
      candidateMetadata: {
        source: "ai_generated",
        improvementSource: "document",
        documentTitle: "候选标题",
        sourceChunkId: "candidate-chunk",
        sourceChunkIndex: 5,
        documentKnowledgeIndex: 2,
      },
      sourceContext: parseContext.sourceContext,
    });

    assert.equal(metadata["source"], "ai_generated");
    assert.equal(metadata["improvementTaskId"], "task-1");
    assert.equal(metadata["sourceDocumentId"], "doc-1");
    assert.equal(metadata["documentTitle"], "候选标题");
    assert.equal(metadata["sourceChunkId"], "candidate-chunk");
    assert.equal(metadata["sourceChunkIndex"], 5);
    assert.equal(metadata["documentKnowledgeIndex"], 2);
    assert.match(String(metadata["sourceEvidence"]), /差旅报销需要/);
    assert.equal(metadata["sourceEvidence"], metadata["sourceTextExcerpt"]);
  });
});
