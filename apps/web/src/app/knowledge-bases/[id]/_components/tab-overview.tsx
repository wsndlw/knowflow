"use client";

import type { KnowledgeBase, KnowledgeBaseOverview } from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";

type TabOverviewProps = {
  kb: KnowledgeBase;
  overview: KnowledgeBaseOverview;
};

export function TabOverview({ kb, overview }: TabOverviewProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* 计数卡片 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <CountCard label="文档数" value={overview.documentCount} />
        <CountCard label="知识条目" value={overview.knowledgeItemCount} sub={`已发布 ${String(overview.publishedKnowledgeItemCount)}`} />
        <CountCard label="成员" value={overview.memberCount} />
        <CountCard label="条目状态" value={`${String(Object.keys(overview.knowledgeItemStatusCounts).length)} 种`} />
      </div>

      {/* 元信息 */}
      <Card className="p-5">
        <h3 className="text-sm font-medium text-ink-muted mb-4">基本信息</h3>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3.5 sm:grid-cols-2 text-sm">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">描述</dt>
            <dd className="text-ink">{kb.description ?? "暂无描述"}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">部门</dt>
            <dd className="text-ink">{kb.departmentName}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">创建人</dt>
            <dd className="text-ink">{kb.creatorName}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">嵌入模型</dt>
            <dd className="text-ink">
              {kb.embeddingModel}
              <Badge tone="neutral" className="ml-1.5">{kb.embeddingDimension}d</Badge>
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">创建时间</dt>
            <dd className="text-ink tabular-nums">{formatDateTime(kb.createdAt)}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-ink-muted">更新时间</dt>
            <dd className="text-ink tabular-nums">{formatDateTime(kb.updatedAt)}</dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}

function CountCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="text-2xl font-semibold text-ink tabular-nums mt-1">{value}</p>
      {sub !== undefined ? <p className="text-xs text-ink-subtle mt-1">{sub}</p> : null}
    </div>
  );
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
