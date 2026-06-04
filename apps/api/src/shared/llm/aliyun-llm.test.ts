import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GlobalExceptionFilter } from "../filters/global-exception.filter.js";
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
        assert.ok(error instanceof Error);
        assert.equal(error.message, "Model provider request failed");
        return true;
      },
    );
  });

  void it("keeps provider response bodies out of API error responses", async () => {
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

    const error = await client.rerank("question", ["doc"], 1).catch((caught: unknown) => caught);
    const apiResponse = renderApiErrorResponse(error);

    assert.deepEqual(apiResponse, {
      ok: false,
      error: {
        code: "InternalServerError",
        message: "Unexpected server error",
      },
    });
    assert.doesNotMatch(JSON.stringify(apiResponse), /provider-secret-error-body/);
  });
});

function renderApiErrorResponse(exception: unknown): unknown {
  let body: unknown;
  new GlobalExceptionFilter().catch(exception, {
    switchToHttp() {
      return {
        getResponse() {
          return {
            status() {
              return {
                json(value: unknown): void {
                  body = value;
                },
              };
            },
          };
        },
      };
    },
  } as never);

  return body;
}
