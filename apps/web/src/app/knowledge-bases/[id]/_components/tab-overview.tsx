"use client";

import type { KnowledgeBase, KnowledgeBaseOverview } from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card } from "../../../../components/ui/card";
import type { TabValue } from "../_hooks/use-tab-state";

type TabOverviewProps = {
  kb: KnowledgeBase;
  overview: KnowledgeBaseOverview;
  canManage: boolean;
  onJumpTab: (tab: TabValue) => void;
};

export function TabOverview({ kb, overview, canManage, onJumpTab }: TabOverviewProps) {
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
        <h3 className="text-md font-medium text-ink mb-3">基本信息</h3>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">描述</dt>
            <dd className="text-ink">{kb.description ?? "暂无描述"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">部门</dt>
            <dd className="text-ink">{kb.departmentName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">创建人</dt>
            <dd className="text-ink">{kb.creatorName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">嵌入模型</dt>
            <dd className="text-ink">
              {kb.embeddingModel}
              <Badge tone="neutral" className="ml-1.5">{kb.embeddingDimension}d</Badge>
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">创建时间</dt>
            <dd className="text-ink">{formatDateTime(kb.createdAt)}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ink-muted shrink-0">更新时间</dt>
            <dd className="text-ink">{formatDateTime(kb.updatedAt)}</dd>
          </div>
        </dl>
      </Card>

      {/* 快捷入口 */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => onJumpTab("documents")}>
          查看文档
        </Button>
        <Button variant="secondary" size="sm" onClick={() => onJumpTab("knowledge-items")}>
          查看知识条目
        </Button>
        {canManage ? (
          <>
            <Button variant="secondary" size="sm" onClick={() => onJumpTab("agents")}>
              管理专家 Agent
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onJumpTab("members")}>
              管理成员
            </Button>
          </>
        ) : null}
        <Button variant="secondary" size="sm" onClick={() => onJumpTab("analytics")}>
          查看统计
        </Button>
      </div>
    </div>
  );
}

function CountCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink-muted mt-0.5">{label}</p>
      {sub !== undefined ? <p className="text-xs text-ink-subtle mt-0.5">{sub}</p> : null}
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
