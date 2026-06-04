"use client";

import {
  agentListResponseSchema,
  analyticsOverviewResponseSchema,
  conversationListResponseSchema,
  knowledgeBaseListResponseSchema,
  type Agent,
  type AnalyticsOverviewResponse,
  type Conversation,
  type KnowledgeBase,
} from "@knowflow/shared";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useAuth } from "../components/auth-provider";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { EmptyState, Skeleton } from "../components/ui/feedback";
import { MetricCard } from "../components/ui/metric-card";
import { apiRequest } from "../lib/api";

type DashboardData = {
  knowledgeBases: KnowledgeBase[];
  conversations: Conversation[];
  agents: Agent[];
};

export default function HomePage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [overviewLoading, setOverviewLoading] = useState(false);

  const canCreate =
    user?.platformRole === "super_admin" || user?.platformRole === "department_admin";
  // /analytics/overview 仅超管可访问（后端 ForbiddenException），普通用户不发该请求。
  const canViewOverview = user?.platformRole === "super_admin";

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      // 各区独立容错:某个接口失败不影响其他区
      const [kb, conv, agents] = await Promise.all([
        apiRequest("/knowledge-bases", knowledgeBaseListResponseSchema, { cache: "no-store" })
          .then((r) => r.items)
          .catch(() => [] as KnowledgeBase[]),
        apiRequest("/conversations", conversationListResponseSchema, { cache: "no-store" })
          .then((r) => r.items)
          .catch(() => [] as Conversation[]),
        apiRequest("/agents", agentListResponseSchema, { cache: "no-store" })
          .then((r) => r.items)
          .catch(() => [] as Agent[]),
      ]);
      if (!cancelled) {
        setData({ knowledgeBases: kb, conversations: conv, agents });
        setIsLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canViewOverview) {
      setOverview(null);
      return;
    }
    let cancelled = false;
    async function loadOverview() {
      setOverviewLoading(true);
      try {
        const result = await apiRequest(
          "/analytics/overview?range=7d",
          analyticsOverviewResponseSchema,
          { cache: "no-store" },
        );
        if (!cancelled) setOverview(result);
      } catch {
        // 概览失败不阻塞首页其余区块
        if (!cancelled) setOverview(null);
      } finally {
        if (!cancelled) setOverviewLoading(false);
      }
    }
    void loadOverview();
    return () => {
      cancelled = true;
    };
  }, [canViewOverview]);

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {user !== null ? `你好，${user.name}` : "工作台"}
          </h1>
          <p className="mt-1 text-base text-ink-muted">从这里进入知识库与 AI 对话。</p>
        </div>
        <div className="flex gap-2">
          {canCreate ? (
            <Button asChild variant="secondary">
              <Link href="/knowledge-bases">管理知识库</Link>
            </Button>
          ) : null}
          <Button asChild>
            <Link href="/agents">开始对话</Link>
          </Button>
        </div>
      </header>

      {/* 平台概览（仅超管，接 /analytics/overview） */}
      {canViewOverview ? (
        <section className="mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-md font-semibold text-ink">平台概览 · 近 7 天</h2>
            <Link href="/admin/analytics" className="text-sm text-brand-600 hover:text-brand-700">
              查看统计
            </Link>
          </div>
          {overviewLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-20" />
              ))}
            </div>
          ) : overview === null ? (
            <EmptyState title="概览暂不可用" description="统计数据加载失败，可前往统计页重试。" />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              <MetricCard label="知识库" value={overview.entityTotals.knowledgeBaseCount} />
              <MetricCard label="文档" value={overview.entityTotals.documentCount} />
              <MetricCard label="用户" value={overview.entityTotals.userCount} />
              <MetricCard label="Agent" value={overview.entityTotals.agentCount} />
              <MetricCard label="7 日活跃" value={overview.sevenDayActiveUsers} />
              <MetricCard label="提问数" value={overview.totals.questions} />
            </div>
          )}
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* 我的知识库 */}
        <Section title="我的知识库" href="/knowledge-bases" className="lg:col-span-2">
          {isLoading ? (
            <SkeletonRows />
          ) : data && data.knowledgeBases.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {data.knowledgeBases.slice(0, 4).map((kb) => (
                <Link key={kb.id} href={`/knowledge-bases/${kb.id}`}>
                  <Card className="p-4 transition-shadow duration-150 hover:shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium text-ink">{kb.name}</span>
                      <Badge tone={kb.indexStatus === "ready" ? "success" : "neutral"}>
                        {indexLabel(kb.indexStatus)}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-1 text-sm text-ink-muted">
                      {kb.description ?? "暂无描述"}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无可访问的知识库" description="联系管理员将你加入相关知识库。" />
          )}
        </Section>

        {/* 最近对话 */}
        <Section title="最近对话" href="/agents">
          {isLoading ? (
            <SkeletonRows />
          ) : data && data.conversations.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {data.conversations.slice(0, 6).map((conv) => (
                <li key={conv.id}>
                  <Link
                    href="/agents"
                    className="block rounded-md px-3 py-2 text-base text-ink transition-colors hover:bg-neutral-100"
                  >
                    <span className="line-clamp-1">{conv.title}</span>
                    {conv.lastMessageAt !== null ? (
                      <span className="text-xs text-ink-subtle">{formatTime(conv.lastMessageAt)}</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="还没有对话" description="向知识库 Agent 提一个问题试试。" />
          )}
        </Section>

        {/* 推荐 Agent */}
        <Section title="推荐 Agent" href="/agents" className="lg:col-span-3">
          {isLoading ? (
            <SkeletonRows />
          ) : data && data.agents.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.agents.slice(0, 6).map((agent) => (
                <Link key={agent.id} href="/agents">
                  <Card className="flex h-full flex-col p-4 transition-shadow duration-150 hover:shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="grid size-8 place-items-center rounded-md bg-brand-50 text-sm font-semibold text-brand-700">
                        {agent.name.slice(0, 1)}
                      </span>
                      <span className="font-medium text-ink">{agent.name}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
                      {agent.description ?? "基于知识库回答问题"}
                    </p>
                  </Card>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无可用 Agent" description="管理员可在知识库中创建专家 Agent。" />
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  href,
  className,
  children,
}: {
  title: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={className}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        <Link href={href} className="text-sm text-brand-600 hover:text-brand-700">
          查看全部
        </Link>
      </div>
      {children}
    </section>
  );
}

function SkeletonRows() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  );
}

function indexLabel(status: KnowledgeBase["indexStatus"]): string {
  const map: Record<KnowledgeBase["indexStatus"], string> = {
    not_indexed: "未构建",
    indexing: "构建中",
    ready: "可用",
    partial_failed: "部分失败",
    failed: "失败",
  };
  return map[status];
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${String(date.getMonth() + 1)}月${String(date.getDate())}日 ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
