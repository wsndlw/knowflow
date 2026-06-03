"use client";

import { XIcon } from "lucide-react";

import { cn } from "@/lib/cn";

export type TagBadgeData = {
  name: string;
  color: string;
};

/**
 * 标签徽章：color dot + 名称，可选移除按钮。
 * color 为后端 hex（#RRGGBB），动态值用 inline style（同进度条 width，属合理例外）。
 */
export function TagBadge({
  tag,
  className,
  onRemove,
  removeLabel,
}: {
  tag: TagBadgeData;
  className?: string;
  onRemove?: () => void;
  removeLabel?: string;
}) {
  return (
    <span
      data-slot="tag-badge"
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-ink",
        className,
      )}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={removeLabel ?? `移除标签 ${tag.name}`}
          className="-mr-0.5 ml-0.5 grid size-3.5 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
        >
          <XIcon className="size-2.5" />
        </button>
      ) : null}
    </span>
  );
}
