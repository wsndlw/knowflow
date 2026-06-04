"use client";

import type { KnowledgeBase, KnowledgeBaseOverview } from "@knowflow/shared";
import type { ReactNode } from "react";
import { Building2, Calendar, Clock, Cpu, User } from "lucide-react";

import { Badge } from "../../../../components/ui/badge";
import { Card } from "../../../../components/ui/card";
import { MetricCard } from "../../../../components/ui/metric-card";
import { cn } from "../../../../lib/cn";

type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";

const visibilityMeta: Record<string, { label: string; tone: Tone }> = {
  public: { label: "公开", tone: "info" },
  department: { label: "部门", tone: "neutral" },
  restricted: { label: "受限", tone: "warning" },
};

const statusMeta: Record<string, { label: string; tone: Tone }> = {
  active: { label: "启用", tone: "success" },
  disabled: { label: "已禁用", tone: "neutral" },
  archived: { label: "已归档", tone: "neutral" },
};

const indexStatusMeta: Record<string, { label: string; tone: Tone }> = {
  not_indexed: { label: "未索引", tone: "neutral" },
  indexing: { label: "索引中", tone: "info" },
  ready: { label: "已索引", tone: "success" },
  partial_failed: { label: "部分失败", tone: "warning" },
  failed: { label: "索引失败", tone: "danger" },
};

// 文档处理状态：与「文档」tab 保持一致的文案与色调
const docStatusLabels: Record<string, string> = {
  pending: "等待中",
  parsing: "解析中",
  chunking: "切分中",
  embedding: "向量化中",
  completed: "已完成",
  failed: "失败",
};

const docStatusColor: Record<string, string> = {
  pending: "bg-neutral-300",
  parsing: "bg-info",
  chunking: "bg-info",
  embedding: "bg-info",
  completed: "bg-success",
  failed: "bg-danger",
};

const DOC_STATUS_ORDER = ["completed", "embedding", "chunking", "parsing", "pending", "failed"] as const;

type TabOverviewProps = {
  kb: KnowledgeBase;
  overview: KnowledgeBaseOverview;
};

export function TabOverview({ kb, overview }: TabOverviewProps) {
  const visibility = visibilityMeta[kb.visibility] ?? { label: kb.visibility, tone: "neutral" as const };
  const status = statusMeta[kb.status] ?? { label: kb.status, tone: "neutral" as const };
  const indexStatus = indexStatusMeta[kb.indexStatus] ?? { label: kb.indexStatus, tone: "neutral" as const };

  return (
    <div className="flex flex-col gap-6">
      {/* 概要：描述 + 状态 */}
      <Card className="p-5">
        <p className={cn("text-base leading-relaxed", kb.description ? "text-ink" : "text-ink-subtle")}>
          {kb.description ?? "暂无描述"}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone={visibility.tone}>{visibility.label}</Badge>
          <Badge tone={status.tone}>{status.label}</Badge>
          <Badge tone={indexStatus.tone}>{indexStatus.label}</Badge>
        </div>
      </Card>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <MetricCard label="文档数" value={overview.documentCount} />
        <MetricCard label="知识条目" value={overview.knowledgeItemCount} />
        <MetricCard label="已发布条目" value={overview.publishedKnowledgeItemCount} />
        <MetricCard label="成员" value={overview.memberCount} />
      </div>

      {/* 详情：基本信息 + 文档处理分布 */}
      <Card className="p-5">
        <div className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-2">
          <section>
            <h3 className="mb-4 text-sm font-medium text-ink-muted">基本信息</h3>
            <dl className="flex flex-col gap-3.5 text-sm">
              <InfoRow icon={<Building2 />} label="部门" value={kb.departmentName} />
              <InfoRow icon={<User />} label="创建人" value={kb.creatorName} />
              <InfoRow
                icon={<Cpu />}
                label="嵌入模型"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {kb.embeddingModel}
                    <Badge tone="neutral">{kb.embeddingDimension}d</Badge>
                  </span>
                }
              />
              <InfoRow
                icon={<Calendar />}
                label="创建时间"
                value={<span className="tabular-nums">{formatDateTime(kb.createdAt)}</span>}
              />
              <InfoRow
                icon={<Clock />}
                label="更新时间"
                value={<span className="tabular-nums">{formatDateTime(kb.updatedAt)}</span>}
              />
            </dl>
          </section>

          <section>
            <h3 className="mb-4 text-sm font-medium text-ink-muted">文档处理</h3>
            <DocStatusBreakdown counts={overview.documentStatusCounts} total={overview.documentCount} />
          </section>
        </div>
      </Card>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-px flex w-24 shrink-0 items-center gap-2 text-ink-muted">
        <span className="text-ink-subtle [&>svg]:size-4">{icon}</span>
        {label}
      </span>
      <span className="min-w-0 flex-1 text-ink">{value}</span>
    </div>
  );
}

function DocStatusBreakdown({ counts, total }: { counts: Record<string, number>; total: number }) {
  const segments = DOC_STATUS_ORDER.map((key) => ({
    key,
    label: docStatusLabels[key] ?? key,
    color: docStatusColor[key] ?? "bg-neutral-300",
    count: counts[key] ?? 0,
  })).filter((segment) => segment.count > 0);

  if (total === 0 || segments.length === 0) {
    return (
      <div className="flex h-full min-h-[132px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-ink-subtle">
        暂无文档
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-neutral-100">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={segment.color}
            style={{ width: `${String((segment.count / total) * 100)}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {segments.map((segment) => (
          <li key={segment.key} className="flex items-center gap-2 text-sm">
            <span className={cn("size-2 shrink-0 rounded-full", segment.color)} />
            <span className="text-ink-muted">{segment.label}</span>
            <span className="ml-auto font-medium tabular-nums text-ink">{segment.count}</span>
          </li>
        ))}
      </ul>
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
