"use client";

import { useState, type SyntheticEvent } from "react";
import type { RetrievalTestMode, RetrievalTestRequest } from "@knowflow/shared";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { useRetrievalTest, type RetrievalHistoryEntry } from "../_hooks/use-retrieval-test";
import { ConfigPanel, type RetrievalFilters } from "./retrieval-test/config-panel";
import { DebugPanel } from "./retrieval-test/debug-panel";
import { HistorySidebar } from "./retrieval-test/history-sidebar";
import { ResultList } from "./retrieval-test/result-list";
import {
  type AdvancedConfig,
  DEFAULT_ADVANCED,
  disabledParamGroups,
} from "./retrieval-test/helpers";

const DEFAULT_FILTERS: RetrievalFilters = {
  documentStatus: "completed",
  itemStatus: "published",
  sourceType: "all",
};

function narrowDocStatus(value: string): "all" | "completed" {
  return value === "all" ? "all" : "completed";
}

function narrowItemStatus(value: string): "all" | "published" {
  return value === "all" ? "all" : "published";
}

function narrowSourceType(value: string): "all" | "chunk" | "knowledge_item" {
  if (value === "chunk") {
    return "chunk";
  }
  if (value === "knowledge_item") {
    return "knowledge_item";
  }
  return "all";
}

export function TabRetrievalTest({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RetrievalTestMode>("default");
  const [filters, setFilters] = useState<RetrievalFilters>(DEFAULT_FILTERS);
  const [advanced, setAdvanced] = useState<AdvancedConfig>(DEFAULT_ADVANCED);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { result, loading, error, history, run, removeHistory, clearHistory } =
    useRetrievalTest(knowledgeBaseId);

  function composeOverrides(targetMode: RetrievalTestMode): RetrievalTestRequest["overrides"] {
    const disabled = disabledParamGroups(targetMode);
    const overrides: NonNullable<RetrievalTestRequest["overrides"]> = {
      topK: advanced.topK,
      similarityThreshold: advanced.similarityThreshold,
    };
    if (!disabled.has("rerank")) {
      overrides.rerankEnabled = advanced.rerankEnabled;
      overrides.rerankTopN = advanced.rerankTopN;
      overrides.rerankKeepN = advanced.rerankKeepN;
    }
    if (!disabled.has("weights")) {
      overrides.vectorWeight = advanced.vectorWeight;
      overrides.ftsWeight = advanced.ftsWeight;
      overrides.kiWeight = advanced.kiWeight;
    }
    return overrides;
  }

  function buildRequest(
    targetQuery: string,
    targetMode: RetrievalTestMode,
    targetFilters: RetrievalFilters,
  ): RetrievalTestRequest {
    const request: RetrievalTestRequest = {
      query: targetQuery.trim(),
      mode: targetMode,
      filters: {
        documentStatus: narrowDocStatus(targetFilters.documentStatus),
        itemStatus: narrowItemStatus(targetFilters.itemStatus),
        sourceType: narrowSourceType(targetFilters.sourceType),
      },
    };
    if (targetMode === "default") {
      return request;
    }
    return { ...request, overrides: composeOverrides(targetMode) };
  }

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (query.trim() === "" || loading) {
      return;
    }
    void run(buildRequest(query, mode, filters));
  }

  function applyHistory(entry: RetrievalHistoryEntry) {
    setQuery(entry.query);
    setMode(entry.mode);
    setFilters({
      documentStatus: entry.filters.documentStatus,
      itemStatus: entry.filters.itemStatus,
      sourceType: entry.filters.sourceType,
    });
    setHistoryOpen(false);
    void run(buildRequest(entry.query, entry.mode, entry.filters));
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          placeholder="输入要测试检索的问题，回车或点击检索…"
          aria-label="检索测试查询"
          className="flex-1"
        />
        <div className="flex gap-2">
          <Button type="submit" loading={loading} disabled={query.trim() === ""}>
            检索
          </Button>
          <Button type="button" variant="secondary" onClick={() => setHistoryOpen(true)}>
            历史{history.length > 0 ? `（${String(history.length)}）` : ""}
          </Button>
        </div>
      </form>

      {error !== null ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ConfigPanel
          mode={mode}
          onModeChange={setMode}
          filters={filters}
          onFiltersChange={setFilters}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <ResultList result={result} loading={loading} />
          {result !== null ? <DebugPanel debug={result.debug} /> : null}
        </div>
      </div>

      <HistorySidebar
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        onApply={applyHistory}
        onRemove={removeHistory}
        onClear={clearHistory}
      />
    </div>
  );
}
