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
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

type ModelUsageOptions = {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

type ResolvedModelConfig = {
  model: string;
  temperature: number;
  maxOutputTokens: number | null;
  timeoutMs: number;
  retryCount: number;
  baseUrl: string;
  apiKey: string;
};

type UsagePolicy = {
  defaultModelId: string | null;
  fallbackModelId: string | null;
  temperature: number;
  maxOutputTokens: number | null;
  timeoutMs: number;
  retryCount: number;
};

export type ModelUsageMessage = ChatCompletionMessageParam;

export async function callModelByUsage(
  usageType: ModelUsageType,
  messages: ModelUsageMessage[],
  options: ModelUsageOptions = {},
): Promise<string> {
  const config = await resolveModelConfig(usageType);
  const maxTokens = options.maxOutputTokens ?? config.maxOutputTokens;
  const response = await new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    timeout: config.timeoutMs,
    maxRetries: config.retryCount,
  }).chat.completions.create({
    model: options.model ?? config.model,
    messages,
    temperature: options.temperature ?? config.temperature,
    ...(maxTokens === null ? {} : { max_tokens: maxTokens }),
  });

  return response.choices[0]?.message.content ?? "";
}

async function resolveModelConfig(
  usageType: ModelUsageType,
): Promise<ResolvedModelConfig> {
  const [policy] = await db
    .select({
      defaultModelId: modelUsagePolicies.defaultModelId,
      fallbackModelId: modelUsagePolicies.fallbackModelId,
      temperature: modelUsagePolicies.temperature,
      maxOutputTokens: modelUsagePolicies.maxOutputTokens,
      timeoutMs: modelUsagePolicies.timeoutMs,
      retryCount: modelUsagePolicies.retryCount,
    })
    .from(modelUsagePolicies)
    .where(and(eq(modelUsagePolicies.usageType, usageType), eq(modelUsagePolicies.enabled, true)))
    .limit(1);

  if (policy === undefined) {
    throwMissingPolicyError(usageType);
  }

  const modelIds = orderedModelIds(policy);
  if (modelIds.length === 0) {
    throwMissingPolicyError(usageType);
  }

  let lastError: Error | undefined;
  for (const modelId of modelIds) {
    const config = await resolveCatalogModel(modelId, policy);
    if (config === undefined) {
      lastError = new Error(`Configured model is unavailable for ${usageType}`);
      continue;
    }
    if (config.apiKey.length === 0) {
      lastError = new Error(`Model provider API key is not configured for ${usageType}`);
      continue;
    }
    return config;
  }

  throw lastError ?? new Error(`Model configuration is unavailable for ${usageType}`);
}

function orderedModelIds(policy: UsagePolicy): string[] {
  const ids: string[] = [];
  if (policy.defaultModelId !== null) {
    ids.push(policy.defaultModelId);
  }
  if (policy.fallbackModelId !== null && policy.fallbackModelId !== policy.defaultModelId) {
    ids.push(policy.fallbackModelId);
  }
  return ids;
}

async function resolveCatalogModel(
  modelId: string,
  policy: UsagePolicy,
): Promise<ResolvedModelConfig | undefined> {
  const [row] = await db
    .select({
      model: modelCatalog.modelName,
      baseUrl: modelProviders.baseUrl,
      encryptedApiKey: modelProviders.encryptedApiKey,
    })
    .from(modelCatalog)
    .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
    .where(
      and(
        eq(modelCatalog.id, modelId),
        eq(modelCatalog.enabled, true),
        eq(modelProviders.enabled, true),
      ),
    )
    .limit(1);

  if (row === undefined) {
    return undefined;
  }

  return {
    model: row.model,
    temperature: policy.temperature,
    maxOutputTokens: policy.maxOutputTokens,
    timeoutMs: policy.timeoutMs,
    retryCount: policy.retryCount,
    baseUrl: row.baseUrl,
    apiKey: row.encryptedApiKey === null ? "" : decryptApiKey(row.encryptedApiKey),
  };
}

function throwMissingPolicyError(usageType: ModelUsageType): never {
  throw new Error(`Please configure a ${usageType} model in model settings first`);
}
