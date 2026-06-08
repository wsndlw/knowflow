import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { db, retrievalSettings } from "@knowflow/db";
import type { RetrievalSettings, UpdateRetrievalSettingsRequest } from "@knowflow/shared";
import { eq } from "drizzle-orm";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";

export const DEFAULT_RETRIEVAL_SETTINGS: RetrievalSettings = {
  mode: "hybrid_rerank",
  topK: 5,
  similarityThreshold: 0.7,
  rerankEnabled: true,
  rerankTopN: 30,
  rerankKeepN: 10,
  vectorWeight: 0.5,
  ftsWeight: 0.3,
  kiWeight: 0.2,
};

type RetrievalSettingsRow = {
  mode: RetrievalSettings["mode"];
  topK: number;
  similarityThreshold: string;
  rerankEnabled: boolean;
  rerankTopN: number;
  rerankKeepN: number;
  vectorWeight: string;
  ftsWeight: string;
  kiWeight: string;
};

@Injectable()
export class RetrievalSettingsService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
  ) {}

  async get(knowledgeBaseId: string, user: AuthenticatedUser): Promise<RetrievalSettings> {
    await this.ensureCanAccess(knowledgeBaseId, user);
    return this.getForKnowledgeBase(knowledgeBaseId);
  }

  async getForKnowledgeBase(knowledgeBaseId: string): Promise<RetrievalSettings> {
    const [row] = await db
      .select(this.selection())
      .from(retrievalSettings)
      .where(eq(retrievalSettings.knowledgeBaseId, knowledgeBaseId))
      .limit(1);
    return row === undefined ? DEFAULT_RETRIEVAL_SETTINGS : this.toSettings(row);
  }

  async update(
    knowledgeBaseId: string,
    input: UpdateRetrievalSettingsRequest,
    user: AuthenticatedUser,
  ): Promise<RetrievalSettings> {
    await this.ensureCanManage(knowledgeBaseId, user);

    await db
      .insert(retrievalSettings)
      .values({
        knowledgeBaseId,
        mode: input.mode,
        topK: input.topK,
        similarityThreshold: String(input.similarityThreshold),
        rerankEnabled: input.rerankEnabled,
        rerankTopN: input.rerankTopN,
        rerankKeepN: input.rerankKeepN,
        vectorWeight: String(input.vectorWeight),
        ftsWeight: String(input.ftsWeight),
        kiWeight: String(input.kiWeight),
      })
      .onConflictDoUpdate({
        target: retrievalSettings.knowledgeBaseId,
        set: {
          mode: input.mode,
          topK: input.topK,
          similarityThreshold: String(input.similarityThreshold),
          rerankEnabled: input.rerankEnabled,
          rerankTopN: input.rerankTopN,
          rerankKeepN: input.rerankKeepN,
          vectorWeight: String(input.vectorWeight),
          ftsWeight: String(input.ftsWeight),
          kiWeight: String(input.kiWeight),
          updatedAt: new Date(),
        },
      });

    return this.getForKnowledgeBase(knowledgeBaseId);
  }

  private async ensureCanAccess(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("未找到知识库");
  }

  private async ensureCanManage(knowledgeBaseId: string, user: AuthenticatedUser): Promise<void> {
    if (await this.accessService.canManage(knowledgeBaseId, user)) {
      return;
    }
    throw new ForbiddenException("无权管理该知识库的检索设置");
  }

  private selection() {
    return {
      mode: retrievalSettings.mode,
      topK: retrievalSettings.topK,
      similarityThreshold: retrievalSettings.similarityThreshold,
      rerankEnabled: retrievalSettings.rerankEnabled,
      rerankTopN: retrievalSettings.rerankTopN,
      rerankKeepN: retrievalSettings.rerankKeepN,
      vectorWeight: retrievalSettings.vectorWeight,
      ftsWeight: retrievalSettings.ftsWeight,
      kiWeight: retrievalSettings.kiWeight,
    };
  }

  private toSettings(row: RetrievalSettingsRow): RetrievalSettings {
    return {
      mode: row.mode,
      topK: row.topK,
      similarityThreshold: Number(row.similarityThreshold),
      rerankEnabled: row.rerankEnabled,
      rerankTopN: row.rerankTopN,
      rerankKeepN: row.rerankKeepN,
      vectorWeight: Number(row.vectorWeight),
      ftsWeight: Number(row.ftsWeight),
      kiWeight: Number(row.kiWeight),
    };
  }
}
