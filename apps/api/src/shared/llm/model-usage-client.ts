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

export type ResolvedModelConfig = {
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

type CatalogModelConfig = {
  model: string;
  baseUrl: string;
  encryptedApiKey: string | null;
};

export type ModelConfigResolverSources = {
  resolveUsagePolicy: (usageType: ModelUsageType) => Promise<UsagePolicy | undefined>;
  resolveCatalogModel: (modelId: string) => Promise<CatalogModelConfig | undefined>;
  decryptApiKey: (encryptedApiKey: string) => string;
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

export async function resolveModelConfig(
  usageType: ModelUsageType,
): Promise<ResolvedModelConfig> {
  return resolveModelConfigFromSources(usageType, {
    resolveUsagePolicy,
    resolveCatalogModel,
    decryptApiKey,
  });
}

export async function resolveModelConfigFromSources(
  usageType: ModelUsageType,
  sources: ModelConfigResolverSources,
): Promise<ResolvedModelConfig> {
  const policy = await sources.resolveUsagePolicy(usageType);

  if (policy === undefined) {
    throwMissingPolicyError(usageType);
  }

  const modelIds = orderedModelIds(policy);
  if (modelIds.length === 0) {
    throwMissingPolicyError(usageType);
  }

  for (const modelId of modelIds) {
    const catalogModel = await sources.resolveCatalogModel(modelId);
    if (catalogModel === undefined) {
      continue;
    }
    if (catalogModel.encryptedApiKey === null) {
      continue;
    }
    const apiKey = sources.decryptApiKey(catalogModel.encryptedApiKey);
    if (apiKey.length === 0) {
      continue;
    }
    return {
      model: catalogModel.model,
      temperature: policy.temperature,
      maxOutputTokens: policy.maxOutputTokens,
      timeoutMs: policy.timeoutMs,
      retryCount: policy.retryCount,
      baseUrl: catalogModel.baseUrl,
      apiKey,
    };
  }

  throwMissingPolicyError(usageType);
}

async function resolveUsagePolicy(
  usageType: ModelUsageType,
): Promise<UsagePolicy | undefined> {
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

  return policy;
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

async function resolveCatalogModel(modelId: string): Promise<CatalogModelConfig | undefined> {
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
    baseUrl: row.baseUrl,
    encryptedApiKey: row.encryptedApiKey,
  };
}

function throwMissingPolicyError(usageType: ModelUsageType): never {
  throw new Error(`Please configure a ${usageType} model in model settings first`);
}
