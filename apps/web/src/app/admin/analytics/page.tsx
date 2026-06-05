"use client";

import { useState, useEffect, useMemo } from "react";
import type { AnalyticsOverviewResponse } from "@knowflow/shared";
import { analyticsOverviewResponseSchema } from "@knowflow/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useAuth } from "../../../components/auth-provider";
import { apiRequest } from "../../../lib/api";
import { EmptyState } from "../../../components/ui/feedback";
import { MetricCard } from "../../../components/ui/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../components/ui/table";
import { TabList, type TabItem } from "../../../components/ui/tabs";
import {
  AXIS_LINE_STYLE,
  AXIS_TICK_STYLE,
  ChartFrame,
  chartColor,
  GRID_STYLE,
  LEGEND_STYLE,
  TOOLTIP_CONTENT_STYLE,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
} from "../../../components/ui/charts";

type RangeValue = "today" | "7d" | "30d";

const RANGE_LABELS: Record<RangeValue, string> = {
  today: "今日",
  "7d": "近7天",
  "30d": "近30天",
} as const;

export default function AnalyticsPage() {
  const { user } = useAuth();

  // 页级守卫:非超管不渲染内容组件,也不发任何请求。
  // 守卫之后不得再调用 Hooks —— 真正的页面逻辑放在 AnalyticsContent 内。
  if (user?.platformRole !== "super_admin") {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <EmptyState title="无权访问" description="此页面仅超级管理员可见。" />
      </div>
    );
  }

  return <AnalyticsContent />;
}

function AnalyticsContent() {
  const [range, setRange] = useState<RangeValue>("7d");
  const [data, setData] = useState<AnalyticsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [topContentTab, setTopContentTab] = useState<"documents" | "items">("documents");

  useEffect(() => {
    void loadData();
  }, [range]);

  const loadData = async () => {
    setLoading(true);
    try {
      const result = await apiRequest(
        `/analytics/overview?range=${range}`,
        analyticsOverviewResponseSchema,
      );
      setData(result);
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const rangeTabs: TabItem[] = [
    { value: "today", label: RANGE_LABELS.today },
    { value: "7d", label: RANGE_LABELS["7d"] },
    { value: "30d", label: RANGE_LABELS["30d"] },
  ];

  const topContentTabs: TabItem[] = [
    { value: "documents", label: "热门文档" },
    { value: "items", label: "热门条目" },
  ];

  // 实体统计柱状（用户/知识库/文档/Agent 总量；fill 逐项走 token 色）。
  const entityChartData = useMemo(() => {
    if (data === null) return [];
    const { entityTotals } = data;
    return [
      { name: "用户", value: entityTotals.userCount, fill: chartColor(0) },
      { name: "知识库", value: entityTotals.knowledgeBaseCount, fill: chartColor(1) },
      { name: "文档", value: entityTotals.documentCount, fill: chartColor(2) },
      { name: "Agent", value: entityTotals.agentCount, fill: chartColor(3) },
    ];
  }, [data]);

  // 知识库活跃度排行柱状（取前 8，按活跃度倒序）。
  const rankingChartData = useMemo(() => {
    if (data === null) return [];
    return [...data.knowledgeBases]
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((kb) => ({ name: truncate(kb.name, 12), 活跃度: kb.score, 访问量: kb.visits }));
  }, [data]);



  return (
    <div className="mx-auto max-w-5xl px-6 py-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-ink">系统统计</h1>
        <div className="w-full sm:w-80">
          <TabList
            items={rangeTabs}
            value={range}
            onValueChange={(tab) => setRange(tab as RangeValue)}
          />
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[88px] animate-pulse rounded-lg border border-border bg-neutral-50"
              />
            ))}
          </div>
          <div className="h-60 animate-pulse rounded-lg border border-border bg-neutral-50" />
        </div>
      ) : data === null ? (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          加载失败,请稍后重试。
        </p>
      ) : (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 text-base font-semibold text-ink">关键指标</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="访问量" value={data.totals.visits} />
              <MetricCard label="搜索次数" value={data.totals.searches} />
              <MetricCard label="问答次数" value={data.totals.questions} />
              <MetricCard label="活跃用户" value={data.totals.activeUsers} />
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-ink">实体统计</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="用户总数" value={data.entityTotals.userCount} />
              <MetricCard label="知识库总数" value={data.entityTotals.knowledgeBaseCount} />
              <MetricCard label="文档总数" value={data.entityTotals.documentCount} />
              <MetricCard label="Agent 总数" value={data.entityTotals.agentCount} />
            </div>
            <div className="mt-4">
              <ChartFrame title="实体数量分布" height={240}>
                <ResponsiveContainer>
                  <BarChart data={entityChartData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                    <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
                    <XAxis dataKey="name" tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={false} />
                    <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: "var(--color-neutral-100)" }}
                    />
                    <Bar dataKey="value" name="数量" radius={[4, 4, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-ink">知识库排行</h2>
            {rankingChartData.length > 0 ? (
              <div className="mb-4">
                <ChartFrame title="活跃度 Top 8" height={280}>
                  <ResponsiveContainer>
                    <BarChart
                      data={rankingChartData}
                      layout="vertical"
                      margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={false} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={AXIS_TICK_STYLE}
                        axisLine={false}
                        tickLine={false}
                        width={96}
                      />
                      <Tooltip
                        contentStyle={TOOLTIP_CONTENT_STYLE}
                        labelStyle={TOOLTIP_LABEL_STYLE}
                        itemStyle={TOOLTIP_ITEM_STYLE}
                        cursor={{ fill: "var(--color-neutral-100)" }}
                      />
                      <Legend wrapperStyle={LEGEND_STYLE} />
                      <Bar dataKey="活跃度" fill={chartColor(0)} radius={[0, 4, 4, 0]} maxBarSize={18} />
                      <Bar dataKey="访问量" fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={18} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </div>
            ) : null}
            <div className="rounded-lg border border-border bg-surface">
              {data.knowledgeBases.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-muted">暂无数据</p>
              ) : (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>知识库</TableHeaderCell>
                      <TableHeaderCell>访问量</TableHeaderCell>
                      <TableHeaderCell>问答次数</TableHeaderCell>
                      <TableHeaderCell>活跃度</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.knowledgeBases.map((kb) => (
                      <TableRow key={kb.id}>
                        <TableCell className="font-medium">{kb.name}</TableCell>
                        <TableCell className="text-ink-muted">{kb.visits}</TableCell>
                        <TableCell className="text-ink-muted">{kb.questions}</TableCell>
                        <TableCell className="font-medium text-brand-600">{kb.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-semibold text-ink">热门内容</h2>
              <div className="w-full sm:w-80">
                <TabList
                  items={topContentTabs}
                  value={topContentTab}
                  onValueChange={(tab) => setTopContentTab(tab as "documents" | "items")}
                />
              </div>
            </div>
            <div className="rounded-lg border border-border bg-surface">
              {topContentTab === "documents" ? (
                <>
                  {data.topDocuments.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-muted">暂无数据</p>
                  ) : (
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>标题</TableHeaderCell>
                          <TableHeaderCell>所属知识库</TableHeaderCell>
                          <TableHeaderCell>查看次数</TableHeaderCell>
                          <TableHeaderCell>引用次数</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.topDocuments.map((doc) => (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium">{doc.title}</TableCell>
                            <TableCell className="text-ink-muted">{doc.knowledgeBaseName}</TableCell>
                            <TableCell className="text-ink-muted">{doc.views}</TableCell>
                            <TableCell className="text-ink-muted">{doc.citations}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              ) : (
                <>
                  {data.topKnowledgeItems.length === 0 ? (
                    <p className="py-8 text-center text-sm text-ink-muted">暂无数据</p>
                  ) : (
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>标题</TableHeaderCell>
                          <TableHeaderCell>所属知识库</TableHeaderCell>
                          <TableHeaderCell>查看次数</TableHeaderCell>
                          <TableHeaderCell>引用次数</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.topKnowledgeItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-medium">{item.title}</TableCell>
                            <TableCell className="text-ink-muted">{item.knowledgeBaseName}</TableCell>
                            <TableCell className="text-ink-muted">{item.views}</TableCell>
                            <TableCell className="text-ink-muted">{item.citations}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </>
              )}
            </div>
          </div>


        </div>
      )}
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
