import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import { BadRequestException } from "@nestjs/common";
import { db, knowledgeImprovementTasks, knowledgeItems } from "@knowflow/db";
import { improvementTaskListQuerySchema, type ImprovementTaskListQuery } from "@knowflow/shared";
import type { SQL } from "drizzle-orm";

import { KnowledgeImprovementService } from "./knowledge-improvement.service.js";
import type { CandidateDraft } from "./knowledge-improvement-draft.js";

type MutableDb = {
  select: (selection?: unknown) => SelectChain;
  update: (table: unknown) => {
    set: (values: Record<string, unknown>) => {
      where: (condition: unknown) => Promise<unknown[]> | { returning: () => Promise<TaskRow[]> };
    };
  };
};

type SelectChain = {
  from: (table: unknown) => SelectChain;
  innerJoin: (...args: unknown[]) => SelectChain;
  where: (condition: unknown) => SelectChain;
  orderBy: (...args: unknown[]) => SelectChain;
  limit: (limit: number) => Promise<unknown[]>;
};

type TaskRow = {
  id: string;
  status: string;
  knowledgeBaseId: string;
  triggerType: string;
  sourceQuestion: string;
  sourceContext: Record<string, unknown>;
  candidateTitle?: string | null;
  candidateContent?: string | null;
  candidateSummary?: string | null;
  candidateMetadata?: Record<string, unknown>;
};

type ServiceHarness = {
  approve: (
    taskId: string,
    input: { title?: string; content?: string; summary?: string | null },
    user: AuthenticatedUserFixture,
  ) => Promise<unknown>;
  buildListCondition: (knowledgeBaseId: string, query: ImprovementTaskListQuery) => SQL | undefined;
  collectItemFeedbackScanSignals: (knowledgeBaseId: string, cursor: null) => Promise<unknown[]>;
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

type ImmediateFeedbackHarness = {
  triggerFromAnswerFeedback: (feedbackId: string) => Promise<void>;
  triggerFromItemFeedback: (feedbackId: string) => Promise<void>;
  createOrFindTaskAndEnqueue: (signal: unknown) => Promise<void>;
  findPreviousUserQuestion: (
    conversationId: string,
    beforeMessageId: string,
    fallback: string,
  ) => Promise<string>;
};

type AuthenticatedUserFixture = {
  id: string;
  username: string;
  name: string;
  platformRole: "user";
  departmentId: string;
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

const reviewer: AuthenticatedUserFixture = {
  id: "00000000-0000-0000-0000-000000000001",
  username: "alice",
  name: "Alice",
  platformRole: "user",
  departmentId: "00000000-0000-0000-0000-000000000010",
};

void describe("KnowledgeImprovementService archived source filtering", () => {
  void it("excludes archived knowledge items from item feedback scans", async () => {
    const mutableDb = db as unknown as MutableDb;
    const originalSelect = mutableDb.select;
    let capturedCondition: unknown;

    mutableDb.select = () => {
      const chain: SelectChain = {
        from() {
          return chain;
        },
        innerJoin() {
          return chain;
        },
        where(condition: unknown) {
          capturedCondition = condition;
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return Promise.resolve([]);
        },
      };
      return chain;
    };

    try {
      const service = makeService() as unknown as ServiceHarness;
      await service.collectItemFeedbackScanSignals("kb-1", null);
    } finally {
      mutableDb.select = originalSelect;
    }

    const query = db
      .select({ id: knowledgeItems.id })
      .from(knowledgeItems)
      .where(capturedCondition as SQL)
      .toSQL();
    assert.equal(query.params.includes("archived"), true);
  });

  void it("filters list results whose source document or item is archived", () => {
    const service = makeService() as unknown as ServiceHarness;
    const condition = service.buildListCondition("kb-1", improvementTaskListQuerySchema.parse({}));
    const query = db
      .select({ id: knowledgeImprovementTasks.id })
      .from(knowledgeImprovementTasks)
      .where(condition)
      .toSQL();

    assert.match(query.sql, /exists/i);
    assert.match(query.sql, /documents/i);
    assert.match(query.sql, /knowledge_items/i);
    assert.equal(query.params.includes("archived"), true);
    assert.equal(query.params.includes(true), true);
  });

  void it("rejects approval when the source document is archived", async () => {
    const service = makeService({
      selectRows: [[{ enabled: false }]],
      embedTexts: () => {
        throw new Error("embed should not be called for archived sources");
      },
    }) as unknown as ServiceHarness;
    service.findTask = () =>
      Promise.resolve(
        makeCandidateTask({
          sourceContext: { documentId: "00000000-0000-0000-0000-000000000200" },
        }),
      );

    await assert.rejects(
      () => service.approve("task-1", {}, reviewer),
      (error) => error instanceof BadRequestException && error.message.includes("来源文档已归档"),
    );
  });

  void it("rejects approval when the source knowledge item is archived", async () => {
    const service = makeService({
      selectRows: [[{ status: "archived", enabled: false }]],
      embedTexts: () => {
        throw new Error("embed should not be called for archived sources");
      },
    }) as unknown as ServiceHarness;
    service.findTask = () =>
      Promise.resolve(
        makeCandidateTask({
          triggerType: "item_dislike",
          sourceContext: { knowledgeItemId: "00000000-0000-0000-0000-000000000300" },
        }),
      );

    await assert.rejects(
      () => service.approve("task-1", {}, reviewer),
      (error) =>
        error instanceof BadRequestException && error.message.includes("来源知识条目已归档"),
    );
  });
});

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
      const service = makeService() as unknown as ServiceHarness;
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

void describe("KnowledgeImprovementService immediate feedback triggers", () => {
  void it("turns answer dislike feedback into an answer_dislike task signal", async () => {
    const service = makeServiceWithSelectRows([
      [
        {
          id: "feedback-1",
          knowledgeBaseId: "kb-1",
          messageId: "message-1",
          conversationId: "conversation-1",
          rating: "not_useful",
          reason: "wrong",
          correctionContent: null,
          suggestedSource: null,
          messageContent: "Old answer",
          usedContext: [{ title: "Policy" }],
        },
      ],
    ]) as unknown as ImmediateFeedbackHarness;
    const signals: unknown[] = [];
    service.findPreviousUserQuestion = () => Promise.resolve("How do I request leave?");
    service.createOrFindTaskAndEnqueue = (signal) => {
      signals.push(signal);
      return Promise.resolve();
    };

    await service.triggerFromAnswerFeedback("feedback-1");

    assert.equal(signals.length, 1);
    assert.deepEqual(signals[0], {
      knowledgeBaseId: "kb-1",
      triggerType: "answer_dislike",
      sourceMessageId: "message-1",
      sourceFeedbackId: "feedback-1",
      sourceQuestion: "How do I request leave?",
      dedupKey: immediateFeedbackDedupKey("kb-1", "answer_dislike", "feedback-1"),
      sourceContext: {
        reason: "wrong",
        correctionContent: null,
        suggestedSource: null,
        answerContent: "Old answer",
        usedContext: [{ title: "Policy" }],
      },
    });
  });

  void it("ignores answer correction feedback without correction content", async () => {
    const service = makeServiceWithSelectRows([
      [
        {
          id: "feedback-1",
          knowledgeBaseId: "kb-1",
          messageId: "message-1",
          conversationId: "conversation-1",
          rating: "correction",
          reason: null,
          correctionContent: null,
          suggestedSource: null,
          messageContent: "Old answer",
          usedContext: [],
        },
      ],
    ]) as unknown as ImmediateFeedbackHarness;
    let called = false;
    service.createOrFindTaskAndEnqueue = () => {
      called = true;
      return Promise.resolve();
    };

    await service.triggerFromAnswerFeedback("feedback-1");

    assert.equal(called, false);
  });

  void it("turns knowledge item dislikes into an item_dislike task signal", async () => {
    const service = makeServiceWithSelectRows([
      [
        {
          id: "feedback-2",
          knowledgeBaseId: "kb-1",
          knowledgeItemId: "item-1",
          rating: "dislike",
          title: "Leave policy",
          content: "Employees must submit leave requests in the HR system.",
          status: "published",
        },
      ],
    ]) as unknown as ImmediateFeedbackHarness;
    const signals: unknown[] = [];
    service.createOrFindTaskAndEnqueue = (signal) => {
      signals.push(signal);
      return Promise.resolve();
    };

    await service.triggerFromItemFeedback("feedback-2");

    assert.equal(signals.length, 1);
    assert.deepEqual(signals[0], {
      knowledgeBaseId: "kb-1",
      triggerType: "item_dislike",
      sourceMessageId: null,
      sourceFeedbackId: "feedback-2",
      sourceQuestion: "Leave policy",
      dedupKey: immediateFeedbackDedupKey("kb-1", "item_dislike", "feedback-2"),
      sourceContext: {
        knowledgeItemId: "item-1",
        content: "Employees must submit leave requests in the HR system.",
      },
    });
  });
});

function makeService(
  options: {
    selectRows?: unknown[][];
    embedTexts?: (texts: string[]) => Promise<number[][]>;
  } = {},
): KnowledgeImprovementService {
  const mutableDb = db as unknown as MutableDb;
  const originalSelect = mutableDb.select;
  const selectRows = [...(options.selectRows ?? [])];
  if (options.selectRows !== undefined) {
    mutableDb.select = () => {
      const chain: SelectChain = {
        from() {
          return chain;
        },
        innerJoin() {
          return chain;
        },
        where() {
          return chain;
        },
        orderBy() {
          return chain;
        },
        limit() {
          return Promise.resolve(selectRows.shift() ?? []);
        },
      };
      return chain;
    };
  }

  const service = new KnowledgeImprovementService(
    { canManage: () => Promise.resolve(true) } as unknown as ConstructorParameters<
      typeof KnowledgeImprovementService
    >[0],
    {
      embedTexts: options.embedTexts ?? (() => Promise.resolve([])),
    } as unknown as ConstructorParameters<typeof KnowledgeImprovementService>[1],
  );

  if (options.selectRows !== undefined) {
    const originalApprove = service.approve.bind(service);
    service.approve = async (...args) => {
      try {
        return await originalApprove(...args);
      } finally {
        mutableDb.select = originalSelect;
      }
    };
  }

  return service;
}

function makeServiceWithSelectRows(selectRows: unknown[][]): KnowledgeImprovementService {
  const mutableDb = db as unknown as MutableDb;
  const originalSelect = mutableDb.select;
  const service = makeService({ selectRows });

  const restore = () => {
    mutableDb.select = originalSelect;
  };
  const originalAnswerTrigger = service.triggerFromAnswerFeedback.bind(service);
  service.triggerFromAnswerFeedback = async (...args) => {
    try {
      return await originalAnswerTrigger(...args);
    } finally {
      restore();
    }
  };
  const originalItemTrigger = service.triggerFromItemFeedback.bind(service);
  service.triggerFromItemFeedback = async (...args) => {
    try {
      return await originalItemTrigger(...args);
    } finally {
      restore();
    }
  };

  return service;
}

function immediateFeedbackDedupKey(
  knowledgeBaseId: string,
  triggerType: string,
  feedbackId: string,
): string {
  return createHash("sha256")
    .update(`${knowledgeBaseId}:${triggerType}:${feedbackId}`)
    .digest("hex");
}

function makeCandidateTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    status: "candidate_ready",
    knowledgeBaseId: "kb-1",
    triggerType: "document_extraction",
    sourceQuestion: "Question",
    sourceContext: {},
    candidateTitle: "Candidate title",
    candidateContent: "Candidate content",
    candidateSummary: null,
    candidateMetadata: {},
    ...overrides,
  };
}
