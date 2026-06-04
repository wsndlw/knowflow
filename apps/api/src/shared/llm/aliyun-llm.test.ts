import { BadGatewayException } from "@nestjs/common";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { AliyunLlmClient } from "./aliyun-llm.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

void describe("AliyunLlmClient", () => {
  void it("redacts provider response bodies when rerank requests fail", async () => {
    globalThis.fetch = () =>
      Promise.resolve(
        new Response("provider-secret-error-body", {
          status: 500,
        }),
      );
    const client = new AliyunLlmClient(() =>
      Promise.resolve({
        model: "gte-rerank",
        temperature: 0,
        maxOutputTokens: null,
        timeoutMs: 1000,
        retryCount: 0,
        baseUrl: "https://dashscope.example/compatible-mode/v1",
        apiKey: "plain-key",
      }),
    );

    await assert.rejects(
      client.rerank("question", ["doc"], 1),
      (error: unknown) => {
        assert.ok(error instanceof BadGatewayException);
        assert.equal(error.message, "Model provider request failed");
        assert.doesNotMatch(JSON.stringify(error.getResponse()), /provider-secret-error-body/);
        return true;
      },
    );
  });
});
