"use client";

import Link from "next/link";
import type { KnowledgeBase } from "@knowflow/shared";

type DetailHeaderProps = {
  kb: KnowledgeBase;
};

export function DetailHeader({ kb }: DetailHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <Link
        href="/knowledge-bases"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-brand-600 transition-colors w-fit"
      >
        <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
          <path d="M10 12 6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        返回知识库列表
      </Link>
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-xl font-semibold text-ink truncate">{kb.name}</h1>
      </div>
    </div>
  );
}
