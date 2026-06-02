"use client";

import Link from "next/link";
import { useState } from "react";
import type { KnowledgeBase } from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { apiRequest, emptyObjectSchema } from "../../../../lib/api";

type DetailHeaderProps = {
  kb: KnowledgeBase;
  canManage: boolean;
  onDeleted: () => void;
};

const visibilityLabels: Record<string, { label: string; tone: "neutral" | "brand" | "info" }> = {
  public: { label: "公开", tone: "brand" },
  department: { label: "部门", tone: "info" },
  restricted: { label: "受限", tone: "neutral" },
};

const statusLabels: Record<string, { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "启用", tone: "success" },
  disabled: { label: "停用", tone: "warning" },
  archived: { label: "归档", tone: "neutral" },
};

const indexLabels: Record<string, { label: string; tone: "success" | "warning" | "danger" | "info" | "neutral" }> = {
  not_indexed: { label: "未索引", tone: "neutral" },
  indexing: { label: "索引中", tone: "info" },
  ready: { label: "就绪", tone: "success" },
  partial_failed: { label: "部分失败", tone: "warning" },
  failed: { label: "索引失败", tone: "danger" },
};

export function DetailHeader({ kb, canManage, onDeleted }: DetailHeaderProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiRequest(`/knowledge-bases/${kb.id}`, emptyObjectSchema, {
        method: "DELETE",
      });
      onDeleted();
    } catch {
      setDeleting(false);
    }
  }

  const vis = visibilityLabels[kb.visibility] ?? { label: kb.visibility, tone: "neutral" as const };
  const st = statusLabels[kb.status] ?? { label: kb.status, tone: "neutral" as const };
  const idx = indexLabels[kb.indexStatus] ?? { label: kb.indexStatus, tone: "neutral" as const };

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
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="text-xl font-semibold text-ink truncate">{kb.name}</h1>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge tone={vis.tone}>{vis.label}</Badge>
            <Badge tone={st.tone}>{st.label}</Badge>
            <Badge tone={idx.tone}>{idx.label}</Badge>
          </div>
        </div>
        {canManage ? (
          <Button variant="danger" size="sm" onClick={() => setConfirmOpen(true)}>
            删除知识库
          </Button>
        ) : null}
      </div>

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="确认删除"
        description="删除后数据无法恢复,确定要删除该知识库吗?"
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
            取消
          </Button>
          <Button variant="danger" loading={deleting} onClick={() => void handleDelete()}>
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
