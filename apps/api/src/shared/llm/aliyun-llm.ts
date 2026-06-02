import { Injectable } from "@nestjs/common";
import {
  db,
  decryptApiKey,
  modelCatalog,
  modelProviders,
  modelUsagePolicies,
} from "@knowflow/db";
import type { ModelUsageType } from "@knowflow/shared";
import { and, eq } from "drizzle-orm";
import OpenAI from "openai";

export const EXPECTED_EMBEDDING_DIMENSION = 1024;

type ModelConfig = {
  model: string;
  temperature: number;
  maxOutputTokens: number | null;
  timeoutMs: number;
  retryCount: number;
};

type ResolvedModelConfig = ModelConfig & {
  apiKey: string;
  baseUrl: string;
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
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding" | "agent_generation">;
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
  async embedTexts(texts: string[], model?: string): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const config = await this.resolveModelConfig("embedding");
    const response = await this.createOpenAiClient(config).embeddings.create({
      model: model ?? config.model,
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

    const config = await this.resolveModelConfig("rerank");
    const response = await fetch(process.env["ALIYUN_RERANK_URL"] ?? this.rerankUrl(config), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model ?? config.model,
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
    const config = await this.resolveModelConfig(input.usageType ?? "chat");
    const maxTokens = input.maxOutputTokens ?? config.maxOutputTokens;
    const stream = await this.createOpenAiClient(config).chat.completions.create({
      model: input.model ?? config.model,
      messages: input.messages,
      temperature: input.temperature ?? config.temperature,
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
    usageType?: Extract<ModelUsageType, "chat" | "query_understanding" | "agent_generation">;
    model?: string;
    temperature?: number;
    maxOutputTokens?: number;
  }): Promise<string> {
    const config = await this.resolveModelConfig(input.usageType ?? "chat");
    const maxTokens = input.maxOutputTokens ?? config.maxOutputTokens;
    const response = await this.createOpenAiClient(config).chat.completions.create({
      model: input.model ?? config.model,
      messages: input.messages,
      temperature: input.temperature ?? config.temperature,
      ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
    });

    return response.choices[0]?.message.content ?? "";
  }

  async getModelConfig(usageType: ModelUsageType): Promise<ModelConfig> {
    const config = await this.resolveModelConfig(usageType);
    return {
      model: config.model,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      timeoutMs: config.timeoutMs,
      retryCount: config.retryCount,
    };
  }

  private async resolveModelConfig(usageType: ModelUsageType): Promise<ResolvedModelConfig> {
    const [row] = await db
      .select({
        model: modelCatalog.modelName,
        temperature: modelUsagePolicies.temperature,
        maxOutputTokens: modelUsagePolicies.maxOutputTokens,
        timeoutMs: modelUsagePolicies.timeoutMs,
        retryCount: modelUsagePolicies.retryCount,
        baseUrl: modelProviders.baseUrl,
        encryptedApiKey: modelProviders.encryptedApiKey,
      })
      .from(modelUsagePolicies)
      .innerJoin(modelCatalog, eq(modelCatalog.id, modelUsagePolicies.defaultModelId))
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .where(
        and(
          eq(modelUsagePolicies.usageType, usageType),
          eq(modelUsagePolicies.enabled, true),
          eq(modelCatalog.enabled, true),
          eq(modelProviders.enabled, true),
        ),
      )
      .limit(1);

    if (row !== undefined) {
      if (row.encryptedApiKey === null) {
        throw new Error(`Model provider API key is not configured for ${usageType}`);
      }
      return {
        model: row.model,
        temperature: row.temperature,
        maxOutputTokens: row.maxOutputTokens,
        timeoutMs: row.timeoutMs,
        retryCount: row.retryCount,
        baseUrl: row.baseUrl,
        apiKey: decryptApiKey(row.encryptedApiKey),
      };
    }

    throw new Error(`Model usage policy is not configured for ${usageType}`);
  }

  private createOpenAiClient(config: ResolvedModelConfig): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: config.timeoutMs,
      maxRetries: config.retryCount,
    });
  }

  private rerankUrl(config: ResolvedModelConfig): string {
    return `${config.baseUrl.replace(/\/compatible-mode\/v1\/?$/, "")}/api/v1/services/rerank/text-rerank/text-rerank`;
  }
}
