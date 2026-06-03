"use client";

import { SearchIcon, XIcon } from "lucide-react";

import { Input } from "@/components/ui/input";

type MindMapSearchProps = {
  value: string;
  onChange: (value: string) => void;
  matchCount: number;
};

export function MindMapSearch({ value, onChange, matchCount }: MindMapSearchProps) {
  return (
    <div className="relative w-56">
      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-subtle" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="搜索节点…"
        className="h-8 pr-14 pl-8"
        aria-label="搜索节点"
      />
      {value ? (
        <div className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center gap-1">
          <span className="text-xs text-ink-subtle">{matchCount}</span>
          <button
            type="button"
            aria-label="清空搜索"
            onClick={() => onChange("")}
            className="rounded p-0.5 text-ink-subtle hover:bg-muted"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
