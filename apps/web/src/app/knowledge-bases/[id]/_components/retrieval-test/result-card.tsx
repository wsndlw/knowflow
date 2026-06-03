"use client";

import { useState } from "react";
import { ChevronDownIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/cn";

import { ResultDetail } from "./result-detail";
import {
  RESULT_TYPE_LABELS,
  SCORE_FIELDS,
  SCORE_LABELS,
  formatScore,
  type RetrievalResult,
} from "./helpers";

export function ResultCard({ result }: { result: RetrievalResult }) {
  const [open, setOpen] = useState(false);

  const title =
    result.type === "knowledge_item"
      ? (result.knowledgeItem?.title ?? result.source.documentTitle ?? "知识条目")
      : (result.source.documentTitle ?? "未命名文档");

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="rounded-lg border border-border bg-surface"
    >
      <div className="flex flex-col gap-2.5 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
            {result.rank}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={result.type === "knowledge_item" ? "info" : "neutral"}>
                {RESULT_TYPE_LABELS[result.type] ?? result.type}
              </Badge>
              <span className="truncate text-sm font-medium text-ink">{title}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{result.snippet}</p>
          </div>
          <CollapsibleTrigger className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40">
            详情
            <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
          </CollapsibleTrigger>
        </div>

        <div className="flex flex-wrap gap-x-3 gap-y-1 pl-9">
          {SCORE_FIELDS.map((field) => (
            <ScoreChip
              key={field}
              label={SCORE_LABELS[field]}
              value={result.scores[field]}
              highlight={field === "finalScore"}
            />
          ))}
        </div>
      </div>

      <CollapsibleContent className="px-4 pb-4">
        <ResultDetail result={result} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ScoreChip({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | null;
  highlight?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-baseline gap-1 text-xs",
        highlight ? "font-semibold text-brand-700" : "text-ink-subtle",
      )}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatScore(value)}</span>
    </span>
  );
}
