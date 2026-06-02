import { Inject, Injectable } from "@nestjs/common";
import {
  childChunks,
  db,
  documents,
  knowledgeBases,
  knowledgeItems,
  parentChunks,
} from "@knowflow/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import type {
  RetrievalCandidate,
  RetrievalChannel,
  RetrievalContextItem,
  RetrievalResult,
} from "./retrieval.types.js";

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
  parentContent: string;
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
  verifiedBy: string | null;
  status: "draft" | "pending_review" | "published" | "unpublished" | "expired";
  score: number;
};

@Injectable()
export class RetrievalService {
  constructor(
    @Inject(AliyunLlmService)
    private readonly llm: AliyunLlmService,
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
      return this.emptyResult(input.query, input.rewrittenQueries ?? [], input.allowedKnowledgeBaseIds);
    }

    const queryEmbedding = await this.llm.embedTexts([queries[0] ?? input.query]);
    const [vectorRows, ftsRows, knowledgeRows] = await Promise.all([
      this.recallVector(queries[0] ?? input.query, queryEmbedding[0] ?? [], input.allowedKnowledgeBaseIds),
      this.recallFts(queries, input.allowedKnowledgeBaseIds),
      this.recallKnowledgeItems(queries[0] ?? input.query, queryEmbedding[0] ?? [], input.allowedKnowledgeBaseIds),
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
      .select({
        id: childChunks.id,
        knowledgeBaseId: childChunks.knowledgeBaseId,
        knowledgeBaseName: knowledgeBases.name,
        documentId: childChunks.documentId,
        childChunkId: childChunks.id,
        parentChunkId: childChunks.parentChunkId,
        title: documents.title,
        content: childChunks.content,
        parentContent: parentChunks.content,
        pageOrSection: sql<string | null>`coalesce(${parentChunks.title}, ${documents.title})`,
        score: sql<number>`1 - (${childChunks.embedding} <=> ${vectorText}::vector)`,
      })
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
      .select({
        id: childChunks.id,
        knowledgeBaseId: childChunks.knowledgeBaseId,
        knowledgeBaseName: knowledgeBases.name,
        documentId: childChunks.documentId,
        childChunkId: childChunks.id,
        parentChunkId: childChunks.parentChunkId,
        title: documents.title,
        content: childChunks.content,
        parentContent: parentChunks.content,
        pageOrSection: sql<string | null>`coalesce(${parentChunks.title}, ${documents.title})`,
        score: sql<number>`ts_rank_cd(${childChunks.searchVector}, plainto_tsquery('simple', ${query}))`,
      })
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
      .orderBy(desc(sql`ts_rank_cd(${childChunks.searchVector}, plainto_tsquery('simple', ${query}))`))
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
      .select({
        id: knowledgeItems.id,
        knowledgeBaseId: knowledgeItems.knowledgeBaseId,
        knowledgeBaseName: knowledgeBases.name,
        knowledgeItemId: knowledgeItems.id,
        title: knowledgeItems.title,
        content: knowledgeItems.content,
        verifiedBy: knowledgeItems.verifiedBy,
        status: knowledgeItems.status,
        score: sql<number>`1 - (${knowledgeItems.embedding} <=> ${vectorText}::vector)`,
      })
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
      snippet: this.snippet(row.content),
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
      snippet: this.snippet(row.content),
      pageOrSection: null,
      channels: ["knowledge_item"],
      initialScore: row.score,
      rerankScore: null,
      knowledgeItemVerified: row.verifiedBy !== null,
      sourceExpired: row.status === "expired",
      tokenCount: this.estimateTokenCount(row.content),
    }));
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

  private contextText(candidate: RetrievalCandidate): string {
    return candidate.parentContent ?? candidate.content;
  }

  private snippet(content: string): string {
    const normalized = content.replace(/\s+/g, " ").trim();
    return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
  }

  private estimateTokenCount(content: string): number {
    return Math.max(1, Math.ceil(content.trim().length / 4));
  }

  private toPgVector(embedding: number[]): string {
    return `[${embedding.map((value) => String(value)).join(",")}]`;
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
