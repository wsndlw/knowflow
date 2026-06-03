"use client";

import { Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { RetrievalHistoryEntry } from "../../_hooks/use-retrieval-test";
import { RETRIEVAL_MODE_LABELS, SOURCE_TYPE_LABELS, formatScore } from "./helpers";

type HistorySidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: RetrievalHistoryEntry[];
  onApply: (entry: RetrievalHistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

export function HistorySidebar({
  open,
  onOpenChange,
  history,
  onApply,
  onRemove,
  onClear,
}: HistorySidebarProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>检索历史</SheetTitle>
          <SheetDescription>
            最近 {history.length} 条（最多保留 20 条，仅存于本地浏览器）
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4">
          {history.length === 0 ? (
            <EmptyState title="暂无历史记录" description="执行检索后，查询会自动记录在此。" />
          ) : (
            <ul className="flex flex-col gap-2">
              {history.map((entry) => (
                <li key={entry.id}>
                  <HistoryRow
                    entry={entry}
                    onApply={() => onApply(entry)}
                    onRemove={() => onRemove(entry.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        {history.length > 0 ? (
          <SheetFooter>
            <Button variant="ghost" size="sm" onClick={onClear}>
              清空全部
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function HistoryRow({
  entry,
  onApply,
  onRemove,
}: {
  entry: RetrievalHistoryEntry;
  onApply: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-start gap-2 rounded-md border border-border bg-surface p-3 transition-colors hover:border-brand-300">
      <button
        type="button"
        onClick={onApply}
        className="min-w-0 flex-1 text-left focus-visible:outline-none"
        title="点击回填到检索表单（不会自动检索）"
      >
        <p className="truncate text-sm font-medium text-ink">{entry.query}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {RETRIEVAL_MODE_LABELS[entry.mode]} · {SOURCE_TYPE_LABELS[entry.filters.sourceType] ?? entry.filters.sourceType} ·{" "}
          {entry.resultCount} 条 · 最高 {formatScore(entry.topScore)}
        </p>
        <p className="mt-0.5 text-xs text-ink-subtle">{formatTime(entry.timestamp)}</p>
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label="删除该历史记录"
        className="shrink-0 rounded-md p-1.5 text-ink-subtle transition-colors hover:bg-danger-bg hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <Trash2Icon className="size-3.5" />
      </button>
    </div>
  );
}

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
