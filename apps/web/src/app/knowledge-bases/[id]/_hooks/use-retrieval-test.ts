"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  RetrievalTestMode,
  RetrievalTestRequest,
  RetrievalTestResponse,
} from "@knowflow/shared";

import { retrievalTest } from "@/lib/api";

const HISTORY_LIMIT = 20;
const HISTORY_VERSION = 1;

export type RetrievalHistoryFilters = {
  documentStatus: string;
  itemStatus: string;
  sourceType: string;
};

export type RetrievalHistoryEntry = {
  id: string;
  query: string;
  mode: RetrievalTestMode;
  filters: RetrievalHistoryFilters;
  resultCount: number;
  topScore: number | null;
  timestamp: string;
};

function historyKey(knowledgeBaseId: string): string {
  return `retrieval-test-history-${knowledgeBaseId}`;
}

function isValidEntry(value: unknown): value is RetrievalHistoryEntry {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const entry = value as Record<string, unknown>;
  return (
    typeof entry["id"] === "string" &&
    typeof entry["query"] === "string" &&
    typeof entry["mode"] === "string" &&
    typeof entry["timestamp"] === "string" &&
    typeof entry["resultCount"] === "number" &&
    typeof entry["filters"] === "object" &&
    entry["filters"] !== null
  );
}

// 版本化 + 运行时校验读取，损坏数据直接丢弃（vercel client-localstorage-schema）
function loadHistory(knowledgeBaseId: string): RetrievalHistoryEntry[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(historyKey(knowledgeBaseId));
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      !("entries" in parsed)
    ) {
      return [];
    }
    const { version, entries } = parsed;
    if (version !== HISTORY_VERSION || !Array.isArray(entries)) {
      return [];
    }
    return entries.filter(isValidEntry).slice(0, HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveHistory(knowledgeBaseId: string, entries: RetrievalHistoryEntry[]): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(
      historyKey(knowledgeBaseId),
      JSON.stringify({ version: HISTORY_VERSION, entries: entries.slice(0, HISTORY_LIMIT) }),
    );
  } catch {
    // 隐私模式 / 配额不足时静默忽略
  }
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${String(Date.now())}-${Math.random().toString(36).slice(2)}`;
}

export type UseRetrievalTest = {
  result: RetrievalTestResponse | null;
  loading: boolean;
  error: string | null;
  history: RetrievalHistoryEntry[];
  run: (request: RetrievalTestRequest) => Promise<void>;
  removeHistory: (id: string) => void;
  clearHistory: () => void;
};

export function useRetrievalTest(knowledgeBaseId: string): UseRetrievalTest {
  const [result, setResult] = useState<RetrievalTestResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<RetrievalHistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory(knowledgeBaseId));
  }, [knowledgeBaseId]);

  const run = useCallback(
    async (request: RetrievalTestRequest) => {
      setLoading(true);
      setError(null);
      try {
        const data = await retrievalTest(knowledgeBaseId, request);
        setResult(data);
        const entry: RetrievalHistoryEntry = {
          id: newId(),
          query: request.query,
          mode: request.mode ?? "default",
          filters: {
            documentStatus: request.filters.documentStatus,
            itemStatus: request.filters.itemStatus,
            sourceType: request.filters.sourceType,
          },
          resultCount: data.results.length,
          topScore: data.results[0]?.scores.finalScore ?? null,
          timestamp: new Date().toISOString(),
        };
        setHistory((prev) => {
          const next = [entry, ...prev].slice(0, HISTORY_LIMIT);
          saveHistory(knowledgeBaseId, next);
          return next;
        });
      } catch (caught) {
        // 错误时保留上次结果，仅提示错误
        setError(caught instanceof Error ? caught.message : "检索失败");
      } finally {
        setLoading(false);
      }
    },
    [knowledgeBaseId],
  );

  const removeHistory = useCallback(
    (id: string) => {
      setHistory((prev) => {
        const next = prev.filter((entry) => entry.id !== id);
        saveHistory(knowledgeBaseId, next);
        return next;
      });
    },
    [knowledgeBaseId],
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    saveHistory(knowledgeBaseId, []);
  }, [knowledgeBaseId]);

  return { result, loading, error, history, run, removeHistory, clearHistory };
}
