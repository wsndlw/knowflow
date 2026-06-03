"use client";

import type { RetrievalTestResponse } from "@knowflow/shared";

import { EmptyState, Skeleton } from "@/components/ui/feedback";

import { ResultCard } from "./result-card";

export function ResultList({
  result,
  loading,
}: {
  result: RetrievalTestResponse | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (result === null) {
    return (
      <EmptyState
        title="输入问题开始检索测试"
        description="在上方输入查询，选择检索模式与参数，即可查看各通道召回结果与分数拆解。"
      />
    );
  }

  if (result.results.length === 0) {
    return (
      <EmptyState
        title="没有命中结果"
        description="尝试更换查询词、放宽过滤条件，或降低相似度阈值后重试。"
      />
    );
  }

  const sorted = [...result.results].sort((a, b) => b.scores.finalScore - a.scores.finalScore);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-subtle">
        共 {result.results.length} 条结果（按最终分数降序）
      </p>
      {sorted.map((item) => (
        <ResultCard key={`${item.type}-${item.id}-${String(item.rank)}`} result={item} />
      ))}
    </div>
  );
}
