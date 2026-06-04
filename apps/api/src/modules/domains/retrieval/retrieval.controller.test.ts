import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NotFoundException } from "@nestjs/common";
import type { RetrievalTestResponse } from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { RetrievalController } from "./retrieval.controller.js";
import type { RetrievalService } from "./retrieval.service.js";

const KNOWLEDGE_BASE_ID = "00000000-0000-4000-8000-000000000001";
const USER_ID = "00000000-0000-4000-8000-000000000004";
const DEPARTMENT_ID = "00000000-0000-4000-8000-000000000005";

type RetrievalTestInput = Parameters<RetrievalService["testRetrieve"]>[0];

const user: AuthenticatedUser = {
  id: USER_ID,
  username: "member",
  name: "Member",
  platformRole: "user",
  departmentId: DEPARTMENT_ID,
};

const emptyRetrievalResponse: RetrievalTestResponse = {
  results: [],
  debug: {
    settings: {
      embeddingModel: "text-embedding-v4",
      embeddingDimensions: 1024,
      retrievalMode: "hybrid_rerank",
      topK: 5,
      similarityThreshold: 0.7,
      rerankEnabled: true,
      rerankModel: null,
      rerankTopN: 30,
      rerankKeepN: 10,
      vectorWeight: 0.5,
      ftsWeight: 0.3,
      kiWeight: 0.2,
    },
    performance: {
      vectorRecalled: 0,
      ftsRecalled: 0,
      kiRecalled: 0,
      afterMerge: 0,
      afterRerank: null,
      finalCount: 0,
      timings: {
        embeddingMs: 0,
        vectorMs: 0,
        ftsMs: 0,
        kiMs: 0,
        rerankMs: null,
        totalMs: 0,
      },
    },
  },
};

function buildAccessService(canManage: boolean): KnowledgeBaseAccessService {
  return {
    buildAccessCondition: () => undefined,
    buildManageCondition: () => undefined,
    canAccess: () => Promise.resolve(true),
    canManage: () => Promise.resolve(canManage),
  };
}

void describe("retrieval test permissions", () => {
  void it("rejects non-managers before retrieval runs", async () => {
    let retrievalCalled = false;
    const retrievalService = {
      testRetrieve: () => {
        retrievalCalled = true;
        return Promise.resolve(emptyRetrievalResponse);
      },
    } as unknown as RetrievalService;
    const controller = new RetrievalController(retrievalService, buildAccessService(false));

    await assert.rejects(
      () =>
        controller.testRetrieve(
          { id: KNOWLEDGE_BASE_ID },
          { query: "policy" },
          { headers: {}, user },
        ),
      NotFoundException,
    );
    assert.equal(retrievalCalled, false);
  });

  void it("allows managers and passes canManage into retrieval", async () => {
    let receivedInput: RetrievalTestInput | undefined;
    const retrievalService = {
      testRetrieve: (input: RetrievalTestInput) => {
        receivedInput = input;
        return Promise.resolve(emptyRetrievalResponse);
      },
    } as unknown as RetrievalService;
    const controller = new RetrievalController(retrievalService, buildAccessService(true));

    const response = await controller.testRetrieve(
      { id: KNOWLEDGE_BASE_ID },
      { query: "policy" },
      { headers: {}, user },
    );

    assert.deepEqual(response, { ok: true, data: emptyRetrievalResponse });
    assert.ok(receivedInput);
    assert.equal(receivedInput.knowledgeBaseId, KNOWLEDGE_BASE_ID);
    assert.equal(receivedInput.canManage, true);
  });
});
