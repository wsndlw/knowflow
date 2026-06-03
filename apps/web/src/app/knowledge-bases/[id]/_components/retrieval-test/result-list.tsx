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

  // 后端已按 finalScore 降序排好并据此赋 rank（rank=1 即最高分），返回数组本身即最终顺序。
  // 这里按 rank 升序展示，与卡片角标（result.rank）同一真相源，避免二次按 finalScore 重排
  // 在分数相等/浮点边界时与角标错位。rank 升序 === finalScore 降序，下方文案仍成立。
  const sorted = [...result.results].sort((a, b) => a.rank - b.rank);

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
