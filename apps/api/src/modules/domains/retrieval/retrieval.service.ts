import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  childChunks,
  db,
  documents,
  knowledgeBases,
  knowledgeItems,
  parentChunks,
} from "@knowflow/db";
import type {
  RetrievalMode,
  RetrievalSettings,
  RetrievalTestRequest,
  RetrievalTestResponse,
} from "@knowflow/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { AliyunLlmService, EXPECTED_EMBEDDING_DIMENSION } from "../../../shared/llm/aliyun-llm.js";
import type {
  RetrievalCandidate,
  RetrievalChannel,
  RetrievalContextItem,
  RetrievalResult,
} from "./retrieval.types.js";
import { RetrievalSettingsService } from "./retrieval-settings.service.js";

const VECTOR_TOP_K = 20;
const FTS_TOP_K = 20;
const KNOWLEDGE_ITEM_TOP_K = 10;
const RERANK_TOP_N = 30;
const RERANK_KEEP_N = 10;
const MAX_CONTEXT_TOKENS = 6000;

type DocumentRecallRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  documentId: string;
  childChunkId: string;
  parentChunkId: string;
  title: string;
  content: string;
  parentTitle: string | null;
  parentContent: string;
  headingPath: unknown;
  pageStart: number | null;
  pageEnd: number | null;
  chunkIndex: number;
  tokenCount: number | null;
  createdAt: Date;
  pageOrSection: string | null;
  score: number;
};

type KnowledgeItemRecallRow = {
  id: string;
  knowledgeBaseId: string;
  knowledgeBaseName: string;
  knowledgeItemId: string;
  title: string;
  content: string;
  summary: string | null;
  createdBy: string;
  verifiedBy: string | null;
  verifiedAt: Date | null;
  status: "draft" | "pending_review" | "published" | "unpublished" | "expired";
  viewCount: number;
  citeCount: number;
  likeCount: number;
  createdAt: Date;
  score: number;
};

type TestCandidate = {
  type: "child_chunk" | "knowledge_item";
  id: string;
  content: string;
  channels: ("vector" | "fts" | "knowledge_item")[];
  vectorScore: number | null;
  ftsScore: number | null;
  kiScore: number | null;
  hybridScore: number;
  rerankScore: number | null;
  finalScore: number;
  source: RetrievalTestResponse["results"][number]["source"];
  knowledgeItem?: RetrievalTestResponse["results"][number]["knowledgeItem"];
};

type TimedResult<T> = {
  value: T;
  elapsedMs: number;
};

@Injectable()
export class RetrievalService {
  private readonly logger = new Logger(RetrievalService.name);

  constructor(
    @Inject(AliyunLlmService)
    private readonly llm: AliyunLlmService,
    @Inject(RetrievalSettingsService)
    private readonly retrievalSettings: RetrievalSettingsService,
  ) {}

  async retrieve(input: {
    query: string;
    rewrittenQueries?: string[];
    allowedKnowledgeBaseIds: string[];
  }): Promise<RetrievalResult> {
    const queries = [input.query, ...(input.rewrittenQueries ?? [])]
      .map((query) => query.trim())
      .filter((query, index, list) => query.length > 0 && list.indexOf(query) === index);
    if (queries.length === 0 || input.allowedKnowledgeBaseIds.length === 0) {
      return this.emptyResult(
        input.query,
        input.rewrittenQueries ?? [],
        input.allowedKnowledgeBaseIds,
      );
    }

    const queryEmbedding = await this.llm.embedTexts([queries[0] ?? input.query]);
    const [vectorRows, ftsRows, knowledgeRows] = await Promise.all([
      this.recallVector(
        queries[0] ?? input.query,
        queryEmbedding[0] ?? [],
        input.allowedKnowledgeBaseIds,
      ),
      this.recallFts(queries, input.allowedKnowledgeBaseIds),
      this.recallKnowledgeItems(
        queries[0] ?? input.query,
        queryEmbedding[0] ?? [],
        input.allowedKnowledgeBaseIds,
      ),
    ]);
    const merged = this.mergeCandidates([
      ...this.toDocumentCandidates(vectorRows, "vector"),
      ...this.toDocumentCandidates(ftsRows, "fts"),
      ...this.toKnowledgeItemCandidates(knowledgeRows),
    ]);
    const reranked = await this.rerank(input.query, merged);
    const contexts = this.applyTokenBudget(reranked);

    return {
      query: input.query,
      rewrittenQueries: input.rewrittenQueries ?? [],
      candidates: reranked,
      contexts,
      trace: {
        allowedKnowledgeBaseIds: input.allowedKnowledgeBaseIds,
        recalled: {
          vector: vectorRows.length,
          fts: ftsRows.length,
          knowledgeItem: knowledgeRows.length,
        },
        merged: merged.length,
        reranked: reranked.length,
        final: contexts.length,
      },
    };
  }

  async testRetrieve(input: {
    knowledgeBaseId: string;
    request: RetrievalTestRequest;
    canManage: boolean;
  }): Promise<RetrievalTestResponse> {
    const startedAt = Date.now();
    const storedSettings = await this.retrievalSettings.getForKnowledgeBase(input.knowledgeBaseId);
    const settings = this.resolveTestSettings(storedSettings, input.request);
    const mode = settings.mode;
    const useVector = this.shouldUseVector(mode, input.request.filters.sourceType);
    const useFts = this.shouldUseFts(mode, input.request.filters.sourceType);
    const useKnowledgeItems = this.shouldUseKnowledgeItems(mode, input.request.filters.sourceType);
    const candidateLimit = this.resolveTestCandidateLimit(settings, mode);
    const embeddingConfig = await this.llm.getModelConfig("embedding");

    let embedding: number[] = [];
    let embeddingMs = 0;
    if (useVector || useKnowledgeItems) {
      const timedEmbedding = await this.timed(async () => {
        const [queryEmbedding] = await this.llm.embedTexts([input.request.query]);
        return queryEmbedding ?? [];
      });
      embedding = timedEmbedding.value;
      embeddingMs = timedEmbedding.elapsedMs;
    }

    const vector = useVector
      ? await this.recallChannel(
          "vector",
          () =>
            this.timed(() =>
              this.recallVectorForTest(
                input.request.query,
                embedding,
                input.knowledgeBaseId,
                settings,
                input.request.filters.documentStatus,
                candidateLimit,
              ),
            ),
          [],
        )
      : { value: [], elapsedMs: 0 };
    const fts = useFts
      ? await this.recallChannel(
          "fts",
          () =>
            this.timed(() =>
              this.recallFtsForTest(
                input.request.query,
                input.knowledgeBaseId,
                settings,
                input.request.filters.documentStatus,
                candidateLimit,
              ),
            ),
          [],
        )
      : { value: [], elapsedMs: 0 };
    const knowledgeItems = useKnowledgeItems
      ? await this.recallChannel(
          "knowledge_item",
          () =>
            this.timed(() =>
              this.recallKnowledgeItemsForTest(
                input.request.query,
                embedding,
                input.knowledgeBaseId,
                settings,
                input.request.filters.itemStatus,
                input.canManage,
                candidateLimit,
              ),
            ),
          [],
        )
      : { value: [], elapsedMs: 0 };

    const merged = this.mergeTestCandidates(
      [
        ...vector.value.map((row) => this.toTestDocumentCandidate(row, "vector", settings)),
        ...fts.value.map((row) => this.toTestDocumentCandidate(row, "fts", settings)),
        ...knowledgeItems.value.map((row) => this.toTestKnowledgeItemCandidate(row, settings)),
      ],
      settings,
    ).sort((left, right) => right.hybridScore - left.hybridScore);

    const shouldRerank = mode === "hybrid_rerank" && settings.rerankEnabled;
    let rerankMs: number | null = null;
    let rerankModel: string | null = null;
    let finalCandidates = merged.slice(0, settings.topK);
    let afterRerank: number | null = null;

    if (shouldRerank && merged.length > 0) {
      const rerankStartedAt = Date.now();
      try {
        const rerankConfig = await this.llm.getModelConfig("rerank");
        rerankModel = rerankConfig.model;
        const target = merged.slice(0, Math.min(settings.rerankTopN, merged.length));
        const reranked = await this.llm.rerank(
          input.request.query,
          target.map((candidate) => candidate.content),
          Math.min(settings.rerankKeepN, target.length),
        );
        const scoreByIndex = new Map(
          reranked.map((result) => [result.index, result.relevanceScore]),
        );
        finalCandidates = target
          .map((candidate, index) => {
            const rerankScore = scoreByIndex.get(index) ?? null;
            return {
              ...candidate,
              rerankScore,
              finalScore: rerankScore ?? candidate.hybridScore,
            };
          })
          .filter((candidate) => candidate.rerankScore !== null)
          .sort((left, right) => right.finalScore - left.finalScore)
          .slice(0, settings.rerankKeepN);
        afterRerank = finalCandidates.length;
      } catch (error) {
        this.logger.warn(`Rerank failed, falling back to hybrid sort: ${this.errorMessage(error)}`);
        finalCandidates = merged
          .map((candidate) => ({
            ...candidate,
            rerankScore: null,
            finalScore: candidate.hybridScore,
          }))
          .sort((left, right) => right.finalScore - left.finalScore)
          .slice(0, settings.topK);
      } finally {
        rerankMs = Date.now() - rerankStartedAt;
      }
    }

    const results = finalCandidates.map((candidate, index) => ({
      rank: index + 1,
      type: candidate.type,
      id: candidate.id,
      content: candidate.content,
      snippet: this.snippet(candidate.content, 200),
      channels: candidate.channels,
      scores: {
        vectorScore: candidate.vectorScore,
        ftsScore: candidate.ftsScore,
        kiScore: candidate.kiScore,
        hybridScore: candidate.hybridScore,
        rerankScore: candidate.rerankScore,
        finalScore: candidate.finalScore,
      },
      source: candidate.source,
      ...(candidate.knowledgeItem === undefined ? {} : { knowledgeItem: candidate.knowledgeItem }),
    }));

    return {
      results,
      debug: {
        settings: {
          embeddingModel: embeddingConfig.model,
          embeddingDimensions: EXPECTED_EMBEDDING_DIMENSION,
          retrievalMode: mode,
          topK: settings.topK,
          similarityThreshold: settings.similarityThreshold,
          rerankEnabled: shouldRerank,
          rerankModel,
          rerankTopN: settings.rerankTopN,
          rerankKeepN: settings.rerankKeepN,
          vectorWeight: settings.vectorWeight,
          ftsWeight: settings.ftsWeight,
          kiWeight: settings.kiWeight,
        },
        performance: {
          vectorRecalled: vector.value.length,
          ftsRecalled: fts.value.length,
          kiRecalled: knowledgeItems.value.length,
          afterMerge: merged.length,
          afterRerank,
          finalCount: results.length,
          timings: {
            embeddingMs,
            vectorMs: vector.elapsedMs,
            ftsMs: fts.elapsedMs,
            kiMs: knowledgeItems.elapsedMs,
            rerankMs,
            totalMs: Date.now() - startedAt,
          },
        },
      },
    };
  }

  private async recallVector(
    query: string,
    embedding: number[],
    allowedKnowledgeBaseIds: string[],
  ): Promise<DocumentRecallRow[]> {
    if (embedding.length === 0) {
      return [];
    }

    const vectorText = this.toPgVector(embedding);
    return db
      .select(
        this.documentRecallSelection(
          sql<number>`1 - (${childChunks.embedding} <=> ${vectorText}::vector)`,
        ),
      )
      .from(childChunks)
      .innerJoin(parentChunks, eq(parentChunks.id, childChunks.parentChunkId))
      .innerJoin(documents, eq(documents.id, childChunks.documentId))
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, childChunks.knowledgeBaseId))
      .where(
        and(
          inArray(childChunks.knowledgeBaseId, allowedKnowledgeBaseIds),
          eq(knowledgeBases.status, "active"),
          eq(documents.enabled, true),
          eq(documents.processStatus, "completed"),
          eq(parentChunks.enabled, true),
          eq(childChunks.enabled, true),
          eq(childChunks.embeddingStatus, "completed"),
          sql`${childChunks.embedding} is not null`,
          sql`${query} <> ''`,
        ),
      )
      .orderBy(desc(sql`1 - (${childChunks.embedding} <=> ${vectorText}::vector)`))
      .limit(VECTOR_TOP_K);
  }

  private async recallFts(
    queries: string[],
    allowedKnowledgeBaseIds: string[],
  ): Promise<DocumentRecallRow[]> {
    const query = queries.join(" ");
    return db
      .select(
        this.documentRecallSelection(
          sql<number>`ts_rank_cd(${childChunks.searchVector}, plainto_tsquery('simple', ${query}))`,
        ),
      )
      .from(childChunks)
      .innerJoin(parentChunks, eq(parentChunks.id, childChunks.parentChunkId))
      .innerJoin(documents, eq(documents.id, childChunks.documentId))
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, childChunks.knowledgeBaseId))
      .where(
        and(
          inArray(childChunks.knowledgeBaseId, allowedKnowledgeBaseIds),
          eq(knowledgeBases.status, "active"),
          eq(documents.enabled, true),
          eq(documents.processStatus, "completed"),
          eq(parentChunks.enabled, true),
          eq(childChunks.enabled, true),
          sql`${childChunks.searchVector} @@ plainto_tsquery('simple', ${query})`,
        ),
      )
      .orderBy(
        desc(sql`ts_rank_cd(${childChunks.searchVector}, plainto_tsquery('simple', ${query}))`),
      )
      .limit(FTS_TOP_K);
  }

  private async recallKnowledgeItems(
    query: string,
    embedding: number[],
    allowedKnowledgeBaseIds: string[],
  ): Promise<KnowledgeItemRecallRow[]> {
    if (embedding.length === 0) {
      return [];
    }

    const vectorText = this.toPgVector(embedding);
    return db
      .select(
        this.knowledgeItemRecallSelection(
          sql<number>`1 - (${knowledgeItems.embedding} <=> ${vectorText}::vector)`,
        ),
      )
      .from(knowledgeItems)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, knowledgeItems.knowledgeBaseId))
      .where(
        and(
          inArray(knowledgeItems.knowledgeBaseId, allowedKnowledgeBaseIds),
          eq(knowledgeBases.status, "active"),
          eq(knowledgeItems.enabled, true),
          eq(knowledgeItems.status, "published"),
          sql`${knowledgeItems.embedding} is not null`,
          sql`${query} <> ''`,
        ),
      )
      .orderBy(desc(sql`1 - (${knowledgeItems.embedding} <=> ${vectorText}::vector)`))
      .limit(KNOWLEDGE_ITEM_TOP_K);
  }

  private async recallVectorForTest(
    query: string,
    embedding: number[],
    knowledgeBaseId: string,
    settings: RetrievalSettings,
    documentStatus: "all" | "completed",
    candidateLimit: number,
  ): Promise<DocumentRecallRow[]> {
    if (embedding.length === 0) {
      return [];
    }
    const vectorText = this.toPgVector(embedding);
    const scoreSql = sql<number>`1 - (${childChunks.embedding} <=> ${vectorText}::vector)`;
    return db
      .select(this.documentRecallSelection(scoreSql))
      .from(childChunks)
      .innerJoin(parentChunks, eq(parentChunks.id, childChunks.parentChunkId))
      .innerJoin(documents, eq(documents.id, childChunks.documentId))
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, childChunks.knowledgeBaseId))
      .where(
        and(
          eq(childChunks.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBases.status, "active"),
          eq(documents.enabled, true),
          this.documentStatusCondition(documentStatus),
          eq(parentChunks.enabled, true),
          eq(childChunks.enabled, true),
          eq(childChunks.embeddingStatus, "completed"),
          sql`${childChunks.embedding} is not null`,
          sql`${query} <> ''`,
          sql`${scoreSql} >= ${settings.similarityThreshold}`,
        ),
      )
      .orderBy(desc(scoreSql))
      .limit(candidateLimit);
  }

  private async recallFtsForTest(
    query: string,
    knowledgeBaseId: string,
    settings: RetrievalSettings,
    documentStatus: "all" | "completed",
    candidateLimit: number,
  ): Promise<DocumentRecallRow[]> {
    const scoreSql = sql<number>`ts_rank_cd(${childChunks.searchVector}, plainto_tsquery('simple', ${query}))`;
    return db
      .select(this.documentRecallSelection(scoreSql))
      .from(childChunks)
      .innerJoin(parentChunks, eq(parentChunks.id, childChunks.parentChunkId))
      .innerJoin(documents, eq(documents.id, childChunks.documentId))
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, childChunks.knowledgeBaseId))
      .where(
        and(
          eq(childChunks.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBases.status, "active"),
          eq(documents.enabled, true),
          this.documentStatusCondition(documentStatus),
          eq(parentChunks.enabled, true),
          eq(childChunks.enabled, true),
          sql`${childChunks.searchVector} @@ plainto_tsquery('simple', ${query})`,
        ),
      )
      .orderBy(desc(scoreSql))
      .limit(candidateLimit);
  }

  private async recallKnowledgeItemsForTest(
    query: string,
    embedding: number[],
    knowledgeBaseId: string,
    settings: RetrievalSettings,
    itemStatus: "all" | "published",
    canManage: boolean,
    candidateLimit: number,
  ): Promise<KnowledgeItemRecallRow[]> {
    if (embedding.length === 0) {
      return [];
    }
    const vectorText = this.toPgVector(embedding);
    const scoreSql = sql<number>`1 - (${knowledgeItems.embedding} <=> ${vectorText}::vector)`;
    return db
      .select(this.knowledgeItemRecallSelection(scoreSql))
      .from(knowledgeItems)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, knowledgeItems.knowledgeBaseId))
      .where(
        and(
          eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId),
          eq(knowledgeBases.status, "active"),
          eq(knowledgeItems.enabled, true),
          this.knowledgeItemStatusCondition(itemStatus, canManage),
          sql`${knowledgeItems.embedding} is not null`,
          sql`${query} <> ''`,
          sql`${scoreSql} >= ${settings.similarityThreshold}`,
        ),
      )
      .orderBy(desc(scoreSql))
      .limit(candidateLimit);
  }

  private documentRecallSelection(score: ReturnType<typeof sql<number>>) {
    return {
      id: childChunks.id,
      knowledgeBaseId: childChunks.knowledgeBaseId,
      knowledgeBaseName: knowledgeBases.name,
      documentId: childChunks.documentId,
      childChunkId: childChunks.id,
      parentChunkId: childChunks.parentChunkId,
      title: documents.title,
      content: childChunks.content,
      parentTitle: parentChunks.title,
      parentContent: parentChunks.content,
      headingPath: parentChunks.headingPath,
      pageStart: parentChunks.pageStart,
      pageEnd: parentChunks.pageEnd,
      chunkIndex: childChunks.chunkIndex,
      tokenCount: childChunks.tokenCount,
      createdAt: childChunks.createdAt,
      pageOrSection: sql<string | null>`coalesce(${parentChunks.title}, ${documents.title})`,
      score,
    };
  }

  private knowledgeItemRecallSelection(score: ReturnType<typeof sql<number>>) {
    return {
      id: knowledgeItems.id,
      knowledgeBaseId: knowledgeItems.knowledgeBaseId,
      knowledgeBaseName: knowledgeBases.name,
      knowledgeItemId: knowledgeItems.id,
      title: knowledgeItems.title,
      content: knowledgeItems.content,
      summary: knowledgeItems.summary,
      createdBy: knowledgeItems.createdBy,
      verifiedBy: knowledgeItems.verifiedBy,
      verifiedAt: knowledgeItems.verifiedAt,
      status: knowledgeItems.status,
      viewCount: knowledgeItems.viewCount,
      citeCount: knowledgeItems.citeCount,
      likeCount: knowledgeItems.likeCount,
      createdAt: knowledgeItems.createdAt,
      score,
    };
  }

  private toDocumentCandidates(
    rows: DocumentRecallRow[],
    channel: Extract<RetrievalChannel, "vector" | "fts">,
  ): RetrievalCandidate[] {
    return rows.map((row) => ({
      id: row.parentChunkId,
      sourceType: "knowledge_document",
      knowledgeBaseId: row.knowledgeBaseId,
      knowledgeBaseName: row.knowledgeBaseName,
      documentId: row.documentId,
      knowledgeItemId: null,
      childChunkId: row.childChunkId,
      parentChunkId: row.parentChunkId,
      title: row.title,
      content: row.content,
      parentContent: row.parentContent,
      snippet: this.snippet(row.content, 260),
      pageOrSection: row.pageOrSection,
      channels: [channel],
      initialScore: row.score,
      rerankScore: null,
      knowledgeItemVerified: false,
      sourceExpired: false,
      tokenCount: this.estimateTokenCount(row.parentContent),
    }));
  }

  private toKnowledgeItemCandidates(rows: KnowledgeItemRecallRow[]): RetrievalCandidate[] {
    return rows.map((row) => ({
      id: row.knowledgeItemId,
      sourceType: "knowledge_item",
      knowledgeBaseId: row.knowledgeBaseId,
      knowledgeBaseName: row.knowledgeBaseName,
      documentId: null,
      knowledgeItemId: row.knowledgeItemId,
      childChunkId: null,
      parentChunkId: null,
      title: row.title,
      content: row.content,
      parentContent: null,
      snippet: this.snippet(row.content, 260),
      pageOrSection: null,
      channels: ["knowledge_item"],
      initialScore: row.score,
      rerankScore: null,
      knowledgeItemVerified: row.verifiedBy !== null,
      sourceExpired: row.status === "expired",
      tokenCount: this.estimateTokenCount(row.content),
    }));
  }

  private toTestDocumentCandidate(
    row: DocumentRecallRow,
    channel: "vector" | "fts",
    settings: RetrievalSettings,
  ): TestCandidate {
    const vectorScore = channel === "vector" ? this.roundScore(row.score) : null;
    const ftsScore = channel === "fts" ? this.roundScore(row.score) : null;
    const hybridScore = this.hybridScore(settings, vectorScore, ftsScore, null);
    return {
      type: "child_chunk",
      id: row.childChunkId,
      content: row.content,
      channels: [channel],
      vectorScore,
      ftsScore,
      kiScore: null,
      hybridScore,
      rerankScore: null,
      finalScore: hybridScore,
      source: {
        documentId: row.documentId,
        documentTitle: row.title,
        parentChunkId: row.parentChunkId,
        parentChunkTitle: row.parentTitle,
        parentContent: row.parentContent,
        headingPath: this.normalizeHeadingPath(row.headingPath),
        pageStart: row.pageStart,
        pageEnd: row.pageEnd,
        chunkIndex: row.chunkIndex,
        tokenCount: row.tokenCount,
        createdAt: row.createdAt.toISOString(),
      },
    };
  }

  private toTestKnowledgeItemCandidate(
    row: KnowledgeItemRecallRow,
    settings: RetrievalSettings,
  ): TestCandidate {
    const kiScore = this.roundScore(row.score);
    const hybridScore = this.hybridScore(settings, null, null, kiScore);
    return {
      type: "knowledge_item",
      id: row.knowledgeItemId,
      content: row.content,
      channels: ["knowledge_item"],
      vectorScore: null,
      ftsScore: null,
      kiScore,
      hybridScore,
      rerankScore: null,
      finalScore: hybridScore,
      source: {
        documentId: null,
        documentTitle: null,
        parentChunkId: null,
        parentChunkTitle: null,
        parentContent: null,
        headingPath: null,
        pageStart: null,
        pageEnd: null,
        chunkIndex: null,
        tokenCount: this.estimateTokenCount(row.content),
        createdAt: row.createdAt.toISOString(),
      },
      knowledgeItem: {
        title: row.title,
        status: row.status,
        summary: row.summary,
        createdBy: row.createdBy,
        verifiedBy: row.verifiedBy,
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
        viewCount: row.viewCount,
        citeCount: row.citeCount,
        likeCount: row.likeCount,
      },
    };
  }

  private mergeCandidates(candidates: RetrievalCandidate[]): RetrievalCandidate[] {
    const byKey = new Map<string, RetrievalCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.sourceType}:${candidate.id}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, candidate);
        continue;
      }

      const channels = new Set([...existing.channels, ...candidate.channels]);
      byKey.set(key, {
        ...existing,
        channels: [...channels],
        initialScore: Math.max(existing.initialScore, candidate.initialScore),
        childChunkId: existing.childChunkId ?? candidate.childChunkId,
        content:
          candidate.initialScore > existing.initialScore ? candidate.content : existing.content,
        snippet:
          candidate.initialScore > existing.initialScore ? candidate.snippet : existing.snippet,
      });
    }

    return [...byKey.values()].sort((left, right) => right.initialScore - left.initialScore);
  }

  private mergeTestCandidates(
    candidates: TestCandidate[],
    settings: RetrievalSettings,
  ): TestCandidate[] {
    const byKey = new Map<string, TestCandidate>();
    for (const candidate of candidates) {
      const key = `${candidate.type}:${candidate.id}`;
      const existing = byKey.get(key);
      if (existing === undefined) {
        byKey.set(key, candidate);
        continue;
      }

      const channels = [...new Set([...existing.channels, ...candidate.channels])];
      const vectorScore = this.maxNullable(existing.vectorScore, candidate.vectorScore);
      const ftsScore = this.maxNullable(existing.ftsScore, candidate.ftsScore);
      const kiScore = this.maxNullable(existing.kiScore, candidate.kiScore);
      const hybridScore = this.hybridScore(settings, vectorScore, ftsScore, kiScore);
      byKey.set(key, {
        ...existing,
        channels,
        vectorScore,
        ftsScore,
        kiScore,
        hybridScore,
        finalScore: hybridScore,
      });
    }

    return [...byKey.values()];
  }

  private async rerank(
    query: string,
    candidates: RetrievalCandidate[],
  ): Promise<RetrievalCandidate[]> {
    const target = candidates.slice(0, RERANK_TOP_N);
    if (target.length === 0) {
      return [];
    }

    const results = await this.llm.rerank(
      query,
      target.map((candidate) => this.contextText(candidate)),
      Math.min(RERANK_KEEP_N, target.length),
    );
    const byIndex = new Map(results.map((result) => [result.index, result.relevanceScore]));
    return target
      .map((candidate, index) => ({
        ...candidate,
        rerankScore: byIndex.get(index) ?? null,
      }))
      .filter((candidate) => candidate.rerankScore !== null)
      .sort((left, right) => (right.rerankScore ?? 0) - (left.rerankScore ?? 0))
      .slice(0, RERANK_KEEP_N);
  }

  private applyTokenBudget(candidates: RetrievalCandidate[]): RetrievalContextItem[] {
    const contexts: RetrievalContextItem[] = [];
    let usedTokens = 0;
    for (const candidate of candidates) {
      const contextText = this.contextText(candidate);
      const tokenCount = this.estimateTokenCount(contextText);
      if (contexts.length > 0 && usedTokens + tokenCount > MAX_CONTEXT_TOKENS) {
        continue;
      }

      usedTokens += tokenCount;
      contexts.push({
        ...candidate,
        contextText,
        tokenCount,
        citationIndex: contexts.length + 1,
      });
    }
    return contexts;
  }

  private resolveTestSettings(
    storedSettings: RetrievalSettings,
    request: RetrievalTestRequest,
  ): RetrievalSettings {
    const mode =
      request.mode === undefined || request.mode === "default" ? storedSettings.mode : request.mode;
    const overrides = request.overrides;
    return {
      mode,
      topK: overrides?.topK ?? storedSettings.topK,
      similarityThreshold: overrides?.similarityThreshold ?? storedSettings.similarityThreshold,
      rerankEnabled: overrides?.rerankEnabled ?? storedSettings.rerankEnabled,
      rerankTopN: overrides?.rerankTopN ?? storedSettings.rerankTopN,
      rerankKeepN: overrides?.rerankKeepN ?? storedSettings.rerankKeepN,
      vectorWeight: overrides?.vectorWeight ?? storedSettings.vectorWeight,
      ftsWeight: overrides?.ftsWeight ?? storedSettings.ftsWeight,
      kiWeight: overrides?.kiWeight ?? storedSettings.kiWeight,
    };
  }

  private resolveTestCandidateLimit(settings: RetrievalSettings, mode: RetrievalMode): number {
    if (mode === "hybrid_rerank" && settings.rerankEnabled) {
      return Math.max(settings.topK, settings.rerankTopN);
    }

    return settings.topK;
  }

  private shouldUseVector(
    mode: RetrievalMode,
    sourceType: "all" | "chunk" | "knowledge_item",
  ): boolean {
    return (
      sourceType !== "knowledge_item" &&
      (mode === "vector_only" || mode === "hybrid" || mode === "hybrid_rerank")
    );
  }

  private shouldUseFts(
    mode: RetrievalMode,
    sourceType: "all" | "chunk" | "knowledge_item",
  ): boolean {
    return (
      sourceType !== "knowledge_item" &&
      (mode === "fts_only" || mode === "hybrid" || mode === "hybrid_rerank")
    );
  }

  private shouldUseKnowledgeItems(
    mode: RetrievalMode,
    sourceType: "all" | "chunk" | "knowledge_item",
  ): boolean {
    return (
      sourceType !== "chunk" &&
      (mode === "ki_only" || mode === "hybrid" || mode === "hybrid_rerank")
    );
  }

  private documentStatusCondition(documentStatus: "all" | "completed") {
    return documentStatus === "all"
      ? inArray(documents.processStatus, ["completed", "failed"])
      : eq(documents.processStatus, "completed");
  }

  private knowledgeItemStatusCondition(itemStatus: "all" | "published", canManage: boolean) {
    if (itemStatus === "all" && canManage) {
      return inArray(knowledgeItems.status, ["published", "unpublished", "expired"]);
    }
    return eq(knowledgeItems.status, "published");
  }

  private async recallChannel<T>(
    channel: string,
    recall: () => Promise<TimedResult<T>>,
    fallback: T,
  ): Promise<TimedResult<T>> {
    try {
      return await recall();
    } catch (error) {
      this.logger.warn(`${channel} recall failed: ${this.errorMessage(error)}`);
      return { value: fallback, elapsedMs: 0 };
    }
  }

  private async timed<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
    const startedAt = Date.now();
    const value = await operation();
    return {
      value,
      elapsedMs: Date.now() - startedAt,
    };
  }

  private hybridScore(
    settings: RetrievalSettings,
    vectorScore: number | null,
    ftsScore: number | null,
    kiScore: number | null,
  ): number {
    return this.roundScore(
      (vectorScore ?? 0) * settings.vectorWeight +
        (ftsScore ?? 0) * settings.ftsWeight +
        (kiScore ?? 0) * settings.kiWeight,
    );
  }

  private maxNullable(left: number | null, right: number | null): number | null {
    if (left === null) {
      return right;
    }
    if (right === null) {
      return left;
    }
    return Math.max(left, right);
  }

  private normalizeHeadingPath(value: unknown): string[] | null {
    if (!Array.isArray(value)) {
      return null;
    }
    const headingPath = value.filter((item): item is string => typeof item === "string");
    return headingPath.length === 0 ? null : headingPath;
  }

  private contextText(candidate: RetrievalCandidate): string {
    return candidate.parentContent ?? candidate.content;
  }

  private snippet(content: string, maxLength: number): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
  }

  private estimateTokenCount(content: string): number {
    return Math.max(1, Math.ceil(content.trim().length / 4));
  }

  private toPgVector(embedding: number[]): string {
    return `[${embedding.map((value) => String(value)).join(",")}]`;
  }

  private roundScore(value: number): number {
    return Number(value.toFixed(6));
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private emptyResult(
    query: string,
    rewrittenQueries: string[],
    allowedKnowledgeBaseIds: string[],
  ): RetrievalResult {
    return {
      query,
      rewrittenQueries,
      candidates: [],
      contexts: [],
      trace: {
        allowedKnowledgeBaseIds,
        recalled: {
          vector: 0,
          fts: 0,
          knowledgeItem: 0,
        },
        merged: 0,
        reranked: 0,
        final: 0,
      },
    };
  }
}
