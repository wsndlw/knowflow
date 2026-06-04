import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveModelConfigFromSources } from "./model-usage-client.js";

void describe("resolveModelConfigFromSources", () => {
  void it("tries default before fallback and uses fallback when default is unavailable", async () => {
    const requestedModelIds: string[] = [];

    const config = await resolveModelConfigFromSources("chat", {
      resolveUsagePolicy() {
        return Promise.resolve({
          defaultModelId: "default-model",
          fallbackModelId: "fallback-model",
          temperature: 0.2,
          maxOutputTokens: 512,
          timeoutMs: 3000,
          retryCount: 1,
        });
      },
      resolveCatalogModel(modelId) {
        requestedModelIds.push(modelId);
        if (modelId === "default-model") {
          return Promise.resolve(undefined);
        }
        return Promise.resolve({
          model: "qwen-fallback",
          baseUrl: "https://dashscope.example/compatible-mode/v1",
          encryptedApiKey: "encrypted-fallback",
        });
      },
      decryptApiKey(encryptedApiKey) {
        return encryptedApiKey.replace("encrypted-", "plain-");
      },
    });

    assert.deepEqual(requestedModelIds, ["default-model", "fallback-model"]);
    assert.deepEqual(config, {
      model: "qwen-fallback",
      temperature: 0.2,
      maxOutputTokens: 512,
      timeoutMs: 3000,
      retryCount: 1,
      baseUrl: "https://dashscope.example/compatible-mode/v1",
      apiKey: "plain-fallback",
    });
  });

  void it("deduplicates default and fallback model ids", async () => {
    const requestedModelIds: string[] = [];

    await resolveModelConfigFromSources("rerank", {
      resolveUsagePolicy() {
        return Promise.resolve({
          defaultModelId: "same-model",
          fallbackModelId: "same-model",
          temperature: 0.7,
          maxOutputTokens: null,
          timeoutMs: 30000,
          retryCount: 2,
        });
      },
      resolveCatalogModel(modelId) {
        requestedModelIds.push(modelId);
        return Promise.resolve({
          model: "gte-rerank",
          baseUrl: "https://dashscope.example/compatible-mode/v1",
          encryptedApiKey: "encrypted-key",
        });
      },
      decryptApiKey() {
        return "plain-key";
      },
    });

    assert.deepEqual(requestedModelIds, ["same-model"]);
  });

  void it("skips models with missing API keys and throws a unified configuration error", async () => {
    await assert.rejects(
      resolveModelConfigFromSources("embedding", {
        resolveUsagePolicy() {
          return Promise.resolve({
            defaultModelId: "default-model",
            fallbackModelId: "fallback-model",
            temperature: 0,
            maxOutputTokens: null,
            timeoutMs: 1000,
            retryCount: 0,
          });
        },
        resolveCatalogModel(modelId) {
          return Promise.resolve({
            model: modelId,
            baseUrl: "https://dashscope.example/compatible-mode/v1",
            encryptedApiKey: modelId === "default-model" ? null : "encrypted-empty-key",
          });
        },
        decryptApiKey() {
          return "";
        },
      }),
      /Please configure a embedding model in model settings first/,
    );
  });
});
