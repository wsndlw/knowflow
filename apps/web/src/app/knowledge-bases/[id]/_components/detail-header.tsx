"use client";

import Link from "next/link";
import type { KnowledgeBase } from "@knowflow/shared";

import { Button } from "../../../../components/ui/button";

type DetailHeaderProps = {
  kb: KnowledgeBase;
  canManage: boolean;
  isManageMode: boolean;
  onManageModeChange: (next: boolean) => void;
};

export function DetailHeader({ kb, canManage, isManageMode, onManageModeChange }: DetailHeaderProps) {
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
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h1 className="text-xl font-semibold text-ink truncate">{kb.name}</h1>
          {isManageMode ? (
            <span className="shrink-0 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
              管理模式
            </span>
          ) : null}
        </div>
        {canManage ? (
          <Button
            variant="outline"
            size="xs"
            className="shrink-0"
            onClick={() => onManageModeChange(!isManageMode)}
          >
            {isManageMode ? "退出管理" : "管理"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
