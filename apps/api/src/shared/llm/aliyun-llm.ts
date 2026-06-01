import { Injectable } from "@nestjs/common";
import {
  db,
  modelCatalog,
  modelProviders,
  modelUsagePolicies,
} from "@knowflow/db";
import type { ModelUsageType } from "@knowflow/shared";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";

const DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";
const DEFAULT_RERANK_URL =
  "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank";
const DEFAULT_CHAT_MODEL = "qwen-plus";
const DEFAULT_QUERY_MODEL = "qwen-turbo";
const DEFAULT_EMBEDDING_MODEL = "text-embedding-v4";
const DEFAULT_RERANK_MODEL = "gte-rerank-v2";
export const EXPECTED_EMBEDDING_DIMENSION = 1024;

type ModelConfig = {
  model: string;
  temperature: number;
  maxOutputTokens: number | null;
  timeoutMs: number;
  retryCount: number;
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type RerankResult = {
  index: number;
  relevanceScore: number;
};

type DashScopeRerankResponse = {
  output?: {
    results?: {
      index?: number;
      relevance_score?: number;
    }[];
  };
};

export type ChatStreamChunk = {
  delta: string;
};

@Injectable()
export class AliyunLlmService {
  async embedTexts(texts: string[], model?: string): Promise<number[][]> {
    return createAliyunLlmClient().embedTexts(texts, model);
  }

  async rerank(query: string, documents: string[], topN: number, model?: string): Promise<RerankResult[]> {
    return createAliyunLlmClient().rerank(query, documents, topN, model);
  }

  streamChat(input: {
    messages: ChatMessage[];
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding">;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): AsyncIterable<ChatStreamChunk> {
    return createAliyunLlmClient().streamChat(input);
  }

  async completeChat(input: {
    messages: ChatMessage[];
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding">;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string> {
    return createAliyunLlmClient().completeChat(input);
  }

  async getModelConfig(usageType: ModelUsageType): Promise<ModelConfig> {
    return createAliyunLlmClient().getModelConfig(usageType);
  }
}

export function createAliyunLlmClient(): AliyunLlmClient {
  return new AliyunLlmClient();
}

export class AliyunLlmClient {
  private readonly apiKey = this.requireApiKey();
  private readonly openai = new OpenAI({
    apiKey: this.apiKey,
    baseURL: process.env["ALIYUN_BASE_URL"] ?? DEFAULT_BASE_URL,
  });

  async embedTexts(texts: string[], model?: string): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const config = model === undefined ? await this.getModelConfig("embedding") : undefined;
    const response = await this.openai.embeddings.create({
      model: model ?? config?.model ?? DEFAULT_EMBEDDING_MODEL,
      input: texts,
    });
    if (response.data.length !== texts.length) {
      throw new Error("Embedding response count does not match input count");
    }

    return response.data.map((item) => {
      if (item.embedding.length !== EXPECTED_EMBEDDING_DIMENSION) {
        throw new Error(`Embedding dimension mismatch: ${String(item.embedding.length)}`);
      }
      return item.embedding;
    });
  }

  async rerank(query: string, documents: string[], topN: number, model?: string): Promise<RerankResult[]> {
    if (documents.length === 0) {
      return [];
    }

    const config = model === undefined ? await this.getModelConfig("rerank") : undefined;
    const response = await fetch(process.env["ALIYUN_RERANK_URL"] ?? DEFAULT_RERANK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? config?.model ?? DEFAULT_RERANK_MODEL,
        input: {
          query,
          documents,
        },
        parameters: {
          return_documents: false,
          top_n: Math.min(topN, documents.length),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Aliyun rerank failed: ${String(response.status)} ${await response.text()}`);
    }

    const body = (await response.json()) as DashScopeRerankResponse;
    const results = body.output?.results;
    if (!Array.isArray(results)) {
      throw new Error("Aliyun rerank response is invalid");
    }

    return results
      .map((item) => ({
        index: typeof item.index === "number" ? item.index : -1,
        relevanceScore:
          typeof item.relevance_score === "number" ? item.relevance_score : 0,
      }))
      .filter((item) => item.index >= 0 && item.index < documents.length)
      .sort((left, right) => right.relevanceScore - left.relevanceScore);
  }

  async *streamChat(input: {
    messages: ChatMessage[];
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding">;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): AsyncIterable<ChatStreamChunk> {
    const config =
      input.model === undefined
        ? await this.getModelConfig(input.usageType ?? "chat")
        : undefined;
    const maxTokens = input.maxOutputTokens ?? config?.maxOutputTokens ?? null;
    const stream = await this.openai.chat.completions.create({
      model: input.model ?? config?.model ?? DEFAULT_CHAT_MODEL,
      messages: input.messages,
      temperature: input.temperature ?? config?.temperature ?? 0.7,
      ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta.content;
      if (typeof delta === "string" && delta.length > 0) {
        yield { delta };
      }
    }
  }

  async completeChat(input: {
    messages: ChatMessage[];
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding">;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string> {
    const config =
      input.model === undefined
        ? await this.getModelConfig(input.usageType ?? "chat")
        : undefined;
    const maxTokens = input.maxOutputTokens ?? config?.maxOutputTokens ?? null;
    const response = await this.openai.chat.completions.create({
      model:
        input.model ??
        config?.model ??
        (input.usageType === "query_understanding" ? DEFAULT_QUERY_MODEL : DEFAULT_CHAT_MODEL),
      messages: input.messages,
      temperature: input.temperature ?? config?.temperature ?? 0.2,
      ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
    });

    return response.choices[0]?.message.content ?? "";
  }

  async getModelConfig(usageType: ModelUsageType): Promise<ModelConfig> {
    const [row] = await db
      .select({
        model: modelCatalog.modelName,
        temperature: modelUsagePolicies.temperature,
        maxOutputTokens: modelUsagePolicies.maxOutputTokens,
        timeoutMs: modelUsagePolicies.timeoutMs,
        retryCount: modelUsagePolicies.retryCount,
      })
      .from(modelUsagePolicies)
      .innerJoin(modelCatalog, eq(modelCatalog.id, modelUsagePolicies.defaultModelId))
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .where(and(eq(modelUsagePolicies.usageType, usageType), eq(modelUsagePolicies.enabled, true)))
      .limit(1);

    if (row !== undefined) {
      return row;
    }

    return {
      model: this.defaultModelForUsage(usageType),
      temperature: usageType === "embedding" || usageType === "rerank" ? 0 : 0.7,
      maxOutputTokens: usageType === "chat" ? 4096 : null,
      timeoutMs: 30000,
      retryCount: 2,
    };
  }

  private defaultModelForUsage(usageType: ModelUsageType): string {
    switch (usageType) {
      case "query_understanding":
        return DEFAULT_QUERY_MODEL;
      case "embedding":
        return DEFAULT_EMBEDDING_MODEL;
      case "rerank":
        return DEFAULT_RERANK_MODEL;
      default:
        return DEFAULT_CHAT_MODEL;
    }
  }

  private requireApiKey(): string {
    const apiKey = process.env["ALIYUN_API_KEY"];
    if (apiKey === undefined || apiKey.trim().length === 0) {
      throw new Error("ALIYUN_API_KEY is required for Aliyun LLM calls");
    }
    return apiKey;
  }
}
