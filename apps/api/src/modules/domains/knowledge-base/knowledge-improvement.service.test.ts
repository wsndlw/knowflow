import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { db } from "@knowflow/db";

import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import type { CandidateDraft } from "./knowledge-improvement-draft.js";

type MutableDb = {
  update: (table: unknown) => {
    set: (values: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown[]> | { returning: () => Promise<TaskRow[]> };
    };
  };
};

type TaskRow = {
  id: string;
  status: string;
  knowledgeBaseId: string;
  triggerType: string;
  sourceQuestion: string;
  sourceContext: Record<string, unknown>;
};

type ServiceHarness = {
  generateCandidate: (taskId: string) => Promise<TaskRow>;
  findTask: (taskId: string) => Promise<TaskRow>;
  findRelatedItems: (
    knowledgeBaseId: string,
    sourceQuestion: string,
  ) => Promise<{ title: string; content: string }[]>;
  generateDrafts: (
    task: TaskRow,
    relatedItems: { title: string; content: string }[],
  ) => Promise<CandidateDraft[]>;
  createAdditionalDocumentCandidateTasks: (
    sourceTask: TaskRow,
    drafts: CandidateDraft[],
  ) => Promise<void>;
  toTask: (row: TaskRow) => TaskRow;
};

const documentTask = {
  id: "task-1",
  status: "pending",
  knowledgeBaseId: "kb-1",
  triggerType: "document_extraction",
  sourceQuestion: "Extract knowledge from document: 员工手册",
  sourceContext: {
    documentId: "doc-1",
    documentTitle: "员工手册",
    chunkId: "chunk-1",
    chunkIndex: 0,
  },
};

void describe("KnowledgeImprovementService.generateCandidate", () => {
  void it("writes the first document draft to the source task and queues remaining drafts", async () => {
    const mutableDb = db as unknown as MutableDb;
    const originalUpdate = mutableDb.update;
    const updateCalls: Record<string, unknown>[] = [];
    const processingTask = { ...documentTask, status: "processing" };
    const finalTask = { ...documentTask, status: "candidate_ready" };
    const drafts: CandidateDraft[] = [
      {
        title: "差旅申请审批要求",
        content: "员工出差前必须提交差旅申请，并获得直属主管审批。",
        summary: null,
        confidence: 0.92,
        reasoning: "文档明确说明审批要求。",
        metadata: { documentKnowledgeIndex: 1 },
      },
      {
        title: "报销提交期限",
        content: "差旅报销需要在出差结束后 30 天内提交。",
        summary: null,
        confidence: 0.9,
        reasoning: "文档明确说明提交期限。",
        metadata: { documentKnowledgeIndex: 2 },
      },
      {
        title: "发票验真要求",
        content: "报销发票必须真实、完整，并可通过官方渠道验真。",
        summary: null,
        confidence: 0.88,
        reasoning: "文档明确说明发票要求。",
        metadata: { documentKnowledgeIndex: 3 },
      },
    ];
    let additionalDrafts: CandidateDraft[] = [];

    mutableDb.update = () => ({
      set(values: Record<string, unknown>) {
        updateCalls.push(values);
        return {
          where() {
            return updateCalls.length === 1
              ? { returning: () => Promise.resolve([processingTask]) }
              : Promise.resolve([]);
          },
        };
      },
    });

    try {
      const service = new KnowledgeImprovementService(
        ({ canManage: () => Promise.resolve(true) } as unknown) as ConstructorParameters<
          typeof KnowledgeImprovementService
        >[0],
        ({ embedTexts: () => Promise.resolve([]) } as unknown) as ConstructorParameters<
          typeof KnowledgeImprovementService
        >[1],
      ) as unknown as ServiceHarness;
      service.findTask = () => Promise.resolve(updateCalls.length >= 2 ? finalTask : documentTask);
      service.findRelatedItems = () => Promise.resolve([]);
      service.generateDrafts = () => Promise.resolve(drafts);
      service.createAdditionalDocumentCandidateTasks = (_sourceTask, remainingDrafts) => {
        additionalDrafts = remainingDrafts;
        return Promise.resolve();
      };
      service.toTask = (row) => row;

      const result = await service.generateCandidate("task-1");

      assert.equal(result.status, "candidate_ready");
      const candidateUpdate = updateCalls[1];
      if (candidateUpdate === undefined) {
        throw new Error("candidate update was not written");
      }
      const firstDraft = drafts[0];
      if (firstDraft === undefined) {
        throw new Error("first draft fixture is missing");
      }
      assert.equal(candidateUpdate["status"], "candidate_ready");
      assert.equal(candidateUpdate["candidateTitle"], firstDraft.title);
      assert.equal(candidateUpdate["candidateContent"], firstDraft.content);
      assert.deepEqual(candidateUpdate["candidateMetadata"], { documentKnowledgeIndex: 1 });
      assert.deepEqual(
        additionalDrafts.map((draft) => draft.title),
        ["报销提交期限", "发票验真要求"],
      );
    } finally {
      mutableDb.update = originalUpdate;
    }
  });
});
