"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { RetrievalTestResponse } from "@knowflow/shared";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/cn";

import { RETRIEVAL_MODE_LABELS, formatWeight } from "./helpers";

type DebugInfo = RetrievalTestResponse["debug"];

type FunnelRow = {
  label: string;
  count: number;
  ms: number | null;
  variant: "recall" | "flow";
};

export function DebugPanel({ debug }: { debug: DebugInfo }) {
  const [open, setOpen] = useState(false);
  const { settings, performance } = debug;
  const { timings } = performance;

  const recalls: FunnelRow[] = [
    { label: "向量召回", count: performance.vectorRecalled, ms: timings.vectorMs, variant: "recall" },
    { label: "全文召回", count: performance.ftsRecalled, ms: timings.ftsMs, variant: "recall" },
    { label: "条目召回", count: performance.kiRecalled, ms: timings.kiMs, variant: "recall" },
  ];
  const flow: FunnelRow[] = [
    { label: "合并后", count: performance.afterMerge, ms: null, variant: "flow" },
    ...(performance.afterRerank !== null
      ? [
          {
            label: "Rerank 后",
            count: performance.afterRerank,
            ms: timings.rerankMs,
            variant: "flow" as const,
          },
        ]
      : []),
    { label: "最终", count: performance.finalCount, ms: null, variant: "flow" },
  ];
  const maxCount = Math.max(1, ...recalls.map((row) => row.count), ...flow.map((row) => row.count));

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-surface"
    >
      <CollapsibleTrigger className="flex w-full items-center justify-between p-4 text-sm font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
        <span>调试信息</span>
        <span className="flex items-center gap-2 text-xs font-normal text-ink-subtle">
          总耗时 {timings.totalMs}ms
          <ChevronDownIcon className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-4 px-4 pb-4">
        {/* 参数组 */}
        <section>
          <h4 className="mb-2 text-xs font-medium text-ink-subtle">参数</h4>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 sm:grid-cols-3">
            <Meta label="Embedding 模型" value={settings.embeddingModel} />
            <Meta label="向量维度" value={String(settings.embeddingDimensions)} />
            <Meta
              label="实际模式"
              value={RETRIEVAL_MODE_LABELS[settings.retrievalMode]}
            />
            <Meta label="topK" value={String(settings.topK)} />
            <Meta label="相似度阈值" value={settings.similarityThreshold.toFixed(2)} />
            <Meta label="Rerank" value={settings.rerankEnabled ? "开启" : "关闭"} />
            <Meta label="Rerank 模型" value={settings.rerankModel ?? "—"} />
            <Meta
              label="Rerank topN/keepN"
              value={`${String(settings.rerankTopN)} / ${String(settings.rerankKeepN)}`}
            />
            <Meta
              label="权重 向量/全文/条目"
              value={`${formatWeight(settings.vectorWeight)} / ${formatWeight(settings.ftsWeight)} / ${formatWeight(settings.kiWeight)}`}
            />
          </dl>
        </section>

        <Separator />

        {/* 性能组：漏斗式可视化（自研） */}
        <section className="flex flex-col gap-2">
          <h4 className="text-xs font-medium text-ink-subtle">召回 → 合并 → 精排 → 最终</h4>
          <span className="text-xs text-ink-subtle">各通道召回</span>
          {recalls.map((row) => (
            <FunnelBar key={row.label} row={row} max={maxCount} />
          ))}
          <span className="mt-2 text-xs text-ink-subtle">流转</span>
          {flow.map((row) => (
            <FunnelBar key={row.label} row={row} max={maxCount} />
          ))}
        </section>
      </CollapsibleContent>
    </Collapsible>
  );
}

function FunnelBar({ row, max }: { row: FunnelRow; max: number }) {
  // 宽度按数量占最大值比例；非零时给最小可见宽度
  const ratio = max > 0 ? (row.count / max) * 100 : 0;
  const width = row.count > 0 ? Math.max(4, ratio) : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-xs text-ink-muted">{row.label}</span>
      <div className="h-5 flex-1 overflow-hidden rounded-sm bg-neutral-100">
        <div
          className={cn("h-full rounded-sm", row.variant === "recall" ? "bg-brand-300" : "bg-brand-500")}
          style={{ width: `${String(width)}%` }}
        />
      </div>
      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink">{row.count}</span>
      <span className="w-16 shrink-0 text-right text-xs text-ink-subtle">
        {row.ms !== null ? `${String(row.ms)}ms` : ""}
      </span>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-subtle">{label}</dt>
      <dd className="truncate text-xs text-ink-muted" title={value}>
        {value}
      </dd>
    </div>
  );
}
