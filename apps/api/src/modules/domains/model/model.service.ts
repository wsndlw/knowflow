import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  db,
  decryptApiKey,
  encryptApiKey,
  maskApiKey,
  modelCatalog,
  modelProviders,
  modelUsagePolicies,
  requireModelApiKeyEncryptionKey,
} from "@knowflow/db";
import type {
  CreateModelCatalogRequest,
  CreateModelProviderRequest,
  ModelCatalog,
  ModelProvider,
  ModelProviderListResponse,
  ModelUsagePolicy,
  ModelUsagePolicyListResponse,
  ModelUsageType,
  TestModelProviderRequest,
  TestModelProviderResponse,
  UpdateModelCatalogRequest,
  UpdateModelProviderRequest,
  UpdateModelUsagePolicyRequest,
} from "@knowflow/shared";
import { and, asc, count, eq, or } from "drizzle-orm";
import OpenAI from "openai";

import type { AuthenticatedUser } from "../auth/auth.types.js";

type ModelProviderRow = typeof modelProviders.$inferSelect;
type ModelCatalogRow = typeof modelCatalog.$inferSelect & {
  providerName?: string;
};
type ModelUsagePolicyRow = typeof modelUsagePolicies.$inferSelect;

@Injectable()
export class ModelService {
  constructor() {
    requireModelApiKeyEncryptionKey();
  }

  async listProviders(user: AuthenticatedUser): Promise<ModelProviderListResponse> {
    this.ensureSuperAdmin(user);
    const rows = await db.select().from(modelProviders).orderBy(asc(modelProviders.name));
    return { items: rows.map((row) => this.toProvider(row)) };
  }

  async createProvider(
    input: CreateModelProviderRequest,
    user: AuthenticatedUser,
  ): Promise<ModelProvider> {
    this.ensureSuperAdmin(user);
    const [created] = await db
      .insert(modelProviders)
      .values({
        name: input.name,
        providerType: input.providerType,
        baseUrl: input.baseUrl,
        encryptedApiKey:
          input.apiKey === undefined ? null : encryptApiKey(input.apiKey),
        enabled: input.enabled ?? true,
        timeoutMs: input.timeoutMs ?? 30000,
        retryCount: input.retryCount ?? 2,
        concurrencyLimit: input.concurrencyLimit ?? 5,
        dailyQuota: input.dailyQuota ?? null,
        remark: input.remark ?? null,
      })
      .returning();
    if (created === undefined) {
      throw new BadRequestException("Failed to create model provider");
    }

    return this.toProvider(created);
  }

  async updateProvider(
    id: string,
    input: UpdateModelProviderRequest,
    user: AuthenticatedUser,
  ): Promise<ModelProvider> {
    this.ensureSuperAdmin(user);
    await this.ensureProviderExists(id);

    const values: Partial<typeof modelProviders.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) values.name = input.name;
    if (input.providerType !== undefined) values.providerType = input.providerType;
    if (input.baseUrl !== undefined) values.baseUrl = input.baseUrl;
    if (input.apiKey !== undefined) {
      values.encryptedApiKey = input.apiKey === null ? null : encryptApiKey(input.apiKey);
    }
    if (input.enabled !== undefined) values.enabled = input.enabled;
    if (input.timeoutMs !== undefined) values.timeoutMs = input.timeoutMs;
    if (input.retryCount !== undefined) values.retryCount = input.retryCount;
    if (input.concurrencyLimit !== undefined) values.concurrencyLimit = input.concurrencyLimit;
    if (input.dailyQuota !== undefined) values.dailyQuota = input.dailyQuota;
    if (input.remark !== undefined) values.remark = input.remark;

    const [updated] = await db
      .update(modelProviders)
      .set(values)
      .where(eq(modelProviders.id, id))
      .returning();
    if (updated === undefined) {
      throw new BadRequestException("Failed to update model provider");
    }

    return this.toProvider(updated);
  }

  async deleteProvider(id: string, user: AuthenticatedUser): Promise<void> {
    this.ensureSuperAdmin(user);
    await this.ensureProviderExists(id);
    const [{ value: modelCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(modelCatalog)
      .where(eq(modelCatalog.providerId, id));
    if (modelCount > 0) {
      throw new BadRequestException("Cannot delete a provider that still has models");
    }

    await db.delete(modelProviders).where(eq(modelProviders.id, id));
  }

  async listModels(providerId: string, user: AuthenticatedUser): Promise<{ items: ModelCatalog[] }> {
    this.ensureSuperAdmin(user);
    await this.ensureProviderExists(providerId);
    const rows = await db
      .select({
        id: modelCatalog.id,
        providerId: modelCatalog.providerId,
        providerName: modelProviders.name,
        modelName: modelCatalog.modelName,
        modelType: modelCatalog.modelType,
        contextWindow: modelCatalog.contextWindow,
        supportsStreaming: modelCatalog.supportsStreaming,
        enabled: modelCatalog.enabled,
        createdAt: modelCatalog.createdAt,
        updatedAt: modelCatalog.updatedAt,
      })
      .from(modelCatalog)
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .where(eq(modelCatalog.providerId, providerId))
      .orderBy(asc(modelCatalog.modelType), asc(modelCatalog.modelName));
    return { items: rows.map((row) => this.toModel(row)) };
  }

  async listAllModels(user: AuthenticatedUser): Promise<{ items: ModelCatalog[] }> {
    this.ensureSuperAdmin(user);
    const rows = await db
      .select({
        id: modelCatalog.id,
        providerId: modelCatalog.providerId,
        providerName: modelProviders.name,
        modelName: modelCatalog.modelName,
        modelType: modelCatalog.modelType,
        contextWindow: modelCatalog.contextWindow,
        supportsStreaming: modelCatalog.supportsStreaming,
        enabled: modelCatalog.enabled,
        createdAt: modelCatalog.createdAt,
        updatedAt: modelCatalog.updatedAt,
      })
      .from(modelCatalog)
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .orderBy(
        asc(modelProviders.name),
        asc(modelCatalog.modelType),
        asc(modelCatalog.modelName),
      );
    return { items: rows.map((row) => this.toModel(row)) };
  }

  async createModel(
    providerId: string,
    input: CreateModelCatalogRequest,
    user: AuthenticatedUser,
  ): Promise<ModelCatalog> {
    this.ensureSuperAdmin(user);
    await this.ensureProviderExists(providerId);
    const [created] = await db
      .insert(modelCatalog)
      .values({
        providerId,
        modelName: input.modelName,
        modelType: input.modelType,
        contextWindow: input.contextWindow ?? null,
        supportsStreaming: input.supportsStreaming ?? false,
        enabled: input.enabled ?? true,
      })
      .returning();
    if (created === undefined) {
      throw new BadRequestException("Failed to create model");
    }

    return this.getModel(created.id, user);
  }

  async getModel(id: string, user: AuthenticatedUser): Promise<ModelCatalog> {
    this.ensureSuperAdmin(user);
    const row = await this.findModel(id);
    if (row === undefined) {
      throw new NotFoundException("Model not found");
    }

    return this.toModel(row);
  }

  async updateModel(
    id: string,
    input: UpdateModelCatalogRequest,
    user: AuthenticatedUser,
  ): Promise<ModelCatalog> {
    this.ensureSuperAdmin(user);
    await this.ensureModelExists(id);
    const values: Partial<typeof modelCatalog.$inferInsert> = { updatedAt: new Date() };
    if (input.modelName !== undefined) values.modelName = input.modelName;
    if (input.modelType !== undefined) values.modelType = input.modelType;
    if (input.contextWindow !== undefined) values.contextWindow = input.contextWindow;
    if (input.supportsStreaming !== undefined) values.supportsStreaming = input.supportsStreaming;
    if (input.enabled !== undefined) values.enabled = input.enabled;

    await db.update(modelCatalog).set(values).where(eq(modelCatalog.id, id));
    return this.getModel(id, user);
  }

  async deleteModel(id: string, user: AuthenticatedUser): Promise<void> {
    this.ensureSuperAdmin(user);
    await this.ensureModelExists(id);
    const [{ value: policyCount } = { value: 0 }] = await db
      .select({ value: count() })
      .from(modelUsagePolicies)
      .where(
        or(
          eq(modelUsagePolicies.defaultModelId, id),
          eq(modelUsagePolicies.fallbackModelId, id),
        ),
      );
    if (policyCount > 0) {
      throw new BadRequestException("Cannot delete a model referenced by usage policies");
    }

    await db.delete(modelCatalog).where(eq(modelCatalog.id, id));
  }

  async listUsagePolicies(user: AuthenticatedUser): Promise<ModelUsagePolicyListResponse> {
    this.ensureSuperAdmin(user);
    const rows = await db
      .select()
      .from(modelUsagePolicies)
      .orderBy(asc(modelUsagePolicies.usageType));
    const models = await this.loadModelsByIds(
      rows.flatMap((row) => [row.defaultModelId, row.fallbackModelId]),
    );
    return {
      items: rows.map((row) => this.toUsagePolicy(row, models)),
    };
  }

  async updateUsagePolicy(
    usageType: ModelUsageType,
    input: UpdateModelUsagePolicyRequest,
    user: AuthenticatedUser,
  ): Promise<ModelUsagePolicy> {
    this.ensureSuperAdmin(user);
    if (input.defaultModelId !== undefined && input.defaultModelId !== null) {
      await this.ensureModelExists(input.defaultModelId);
    }
    if (input.fallbackModelId !== undefined && input.fallbackModelId !== null) {
      await this.ensureModelExists(input.fallbackModelId);
    }

    const existing = await db.query.modelUsagePolicies.findFirst({
      where: eq(modelUsagePolicies.usageType, usageType),
    });
    const values: Partial<typeof modelUsagePolicies.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.defaultModelId !== undefined) values.defaultModelId = input.defaultModelId;
    if (input.fallbackModelId !== undefined) values.fallbackModelId = input.fallbackModelId;
    if (input.enabled !== undefined) values.enabled = input.enabled;
    if (input.temperature !== undefined) values.temperature = input.temperature;
    if (input.maxOutputTokens !== undefined) values.maxOutputTokens = input.maxOutputTokens;
    if (input.timeoutMs !== undefined) values.timeoutMs = input.timeoutMs;
    if (input.retryCount !== undefined) values.retryCount = input.retryCount;
    if (input.quota !== undefined) values.quota = input.quota;

    if (existing === undefined) {
      await db.insert(modelUsagePolicies).values({ usageType, ...values });
    } else {
      await db
        .update(modelUsagePolicies)
        .set(values)
        .where(eq(modelUsagePolicies.usageType, usageType));
    }

    const rows = await this.listUsagePolicies(user);
    const updated = rows.items.find((item) => item.usageType === usageType);
    if (updated === undefined) {
      throw new BadRequestException("Failed to update usage policy");
    }
    return updated;
  }

  async testProvider(
    id: string,
    input: TestModelProviderRequest,
    user: AuthenticatedUser,
  ): Promise<TestModelProviderResponse> {
    this.ensureSuperAdmin(user);
    const provider = await this.findProvider(id);
    if (provider === undefined) {
      throw new NotFoundException("Model provider not found");
    }
    if (provider.encryptedApiKey === null) {
      return { ok: false, latencyMs: 0, modelName: null, error: "Provider API key is not configured" };
    }

    const model =
      input.modelId === undefined
        ? await this.findFirstEnabledModel(id)
        : await this.findModel(input.modelId);
    if (model?.providerId !== id) {
      return { ok: false, latencyMs: 0, modelName: null, error: "No testable model found" };
    }

    const startedAt = Date.now();
    try {
      await this.callProviderHealthCheck(provider, model);
      return {
        ok: true,
        latencyMs: Date.now() - startedAt,
        modelName: model.modelName,
        error: null,
      };
    } catch (error: unknown) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        modelName: model.modelName,
        error: error instanceof Error ? error.message.slice(0, 500) : "Connection test failed",
      };
    }
  }

  private ensureSuperAdmin(user: AuthenticatedUser): void {
    if (user.platformRole !== "super_admin") {
      throw new ForbiddenException("Only super admins can manage model configuration");
    }
  }

  private async ensureProviderExists(id: string): Promise<void> {
    if ((await this.findProvider(id)) === undefined) {
      throw new NotFoundException("Model provider not found");
    }
  }

  private async ensureModelExists(id: string): Promise<void> {
    if ((await this.findModel(id)) === undefined) {
      throw new NotFoundException("Model not found");
    }
  }

  private async findProvider(id: string): Promise<ModelProviderRow | undefined> {
    return db.query.modelProviders.findFirst({ where: eq(modelProviders.id, id) });
  }

  private async findModel(id: string): Promise<ModelCatalogRow | undefined> {
    const [row] = await db
      .select({
        id: modelCatalog.id,
        providerId: modelCatalog.providerId,
        providerName: modelProviders.name,
        modelName: modelCatalog.modelName,
        modelType: modelCatalog.modelType,
        contextWindow: modelCatalog.contextWindow,
        supportsStreaming: modelCatalog.supportsStreaming,
        enabled: modelCatalog.enabled,
        createdAt: modelCatalog.createdAt,
        updatedAt: modelCatalog.updatedAt,
      })
      .from(modelCatalog)
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .where(eq(modelCatalog.id, id))
      .limit(1);
    return row;
  }

  private async findFirstEnabledModel(providerId: string): Promise<ModelCatalogRow | undefined> {
    const [row] = await db
      .select({
        id: modelCatalog.id,
        providerId: modelCatalog.providerId,
        providerName: modelProviders.name,
        modelName: modelCatalog.modelName,
        modelType: modelCatalog.modelType,
        contextWindow: modelCatalog.contextWindow,
        supportsStreaming: modelCatalog.supportsStreaming,
        enabled: modelCatalog.enabled,
        createdAt: modelCatalog.createdAt,
        updatedAt: modelCatalog.updatedAt,
      })
      .from(modelCatalog)
      .innerJoin(modelProviders, eq(modelProviders.id, modelCatalog.providerId))
      .where(and(eq(modelCatalog.providerId, providerId), eq(modelCatalog.enabled, true)))
      .orderBy(asc(modelCatalog.modelType), asc(modelCatalog.modelName))
      .limit(1);
    return row;
  }

  private async loadModelsByIds(ids: (string | null)[]): Promise<Map<string, ModelCatalog>> {
    const uniqueIds = [...new Set(ids.filter((id): id is string => id !== null))];
    const map = new Map<string, ModelCatalog>();
    for (const id of uniqueIds) {
      const row = await this.findModel(id);
      if (row !== undefined) {
        map.set(id, this.toModel(row));
      }
    }
    return map;
  }

  private async callProviderHealthCheck(
    provider: ModelProviderRow,
    model: ModelCatalogRow,
  ): Promise<void> {
    if (provider.encryptedApiKey === null) {
      throw new Error("Provider API key is not configured");
    }
    const apiKey = decryptApiKey(provider.encryptedApiKey);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), provider.timeoutMs);
    try {
      if (model.modelType === "rerank" && provider.providerType === "aliyun") {
        await this.testAliyunRerank(provider, model, apiKey, controller.signal);
        return;
      }

      const client = new OpenAI({
        apiKey,
        baseURL: provider.baseUrl,
        timeout: provider.timeoutMs,
        maxRetries: 0,
      });
      if (model.modelType === "embedding") {
        await client.embeddings.create({ model: model.modelName, input: ["health check"] });
        return;
      }

      await client.chat.completions.create({
        model: model.modelName,
        messages: [{ role: "user", content: "Reply with ok." }],
        max_tokens: 8,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async testAliyunRerank(
    provider: ModelProviderRow,
    model: ModelCatalogRow,
    apiKey: string,
    signal: AbortSignal,
  ): Promise<void> {
    const base = provider.baseUrl.replace(/\/compatible-mode\/v1\/?$/, "");
    const response = await fetch(
      `${base}/api/v1/services/rerank/text-rerank/text-rerank`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model.modelName,
          input: { query: "health check", documents: ["health check"] },
          parameters: { return_documents: false, top_n: 1 },
        }),
        signal,
      },
    );
    if (!response.ok) {
      throw new Error(`Rerank test failed: ${String(response.status)} ${await response.text()}`);
    }
  }

  private toProvider(row: ModelProviderRow): ModelProvider {
    let preview: string | null = null;
    if (row.encryptedApiKey !== null) {
      try {
        preview = maskApiKey(decryptApiKey(row.encryptedApiKey));
      } catch {
        preview = "****";
      }
    }

    return {
      id: row.id,
      name: row.name,
      providerType: row.providerType,
      baseUrl: row.baseUrl,
      hasApiKey: row.encryptedApiKey !== null,
      apiKeyPreview: preview,
      enabled: row.enabled,
      timeoutMs: row.timeoutMs,
      retryCount: row.retryCount,
      concurrencyLimit: row.concurrencyLimit,
      dailyQuota: row.dailyQuota,
      remark: row.remark,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toModel(row: ModelCatalogRow): ModelCatalog {
    return {
      id: row.id,
      providerId: row.providerId,
      providerName: row.providerName ?? "",
      modelName: row.modelName,
      modelType: row.modelType,
      contextWindow: row.contextWindow,
      supportsStreaming: row.supportsStreaming,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toUsagePolicy(
    row: ModelUsagePolicyRow,
    models: Map<string, ModelCatalog>,
  ): ModelUsagePolicy {
    return {
      id: row.id,
      usageType: row.usageType,
      defaultModelId: row.defaultModelId,
      fallbackModelId: row.fallbackModelId,
      enabled: row.enabled,
      temperature: row.temperature,
      maxOutputTokens: row.maxOutputTokens,
      timeoutMs: row.timeoutMs,
      retryCount: row.retryCount,
      quota: row.quota,
      defaultModel: row.defaultModelId === null ? null : (models.get(row.defaultModelId) ?? null),
      fallbackModel:
        row.fallbackModelId === null ? null : (models.get(row.fallbackModelId) ?? null),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
