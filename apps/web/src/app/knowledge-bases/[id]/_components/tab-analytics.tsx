"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  knowledgeBaseAnalyticsResponseSchema,
  type KnowledgeBaseAnalyticsResponse,
} from "@knowflow/shared";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { MetricCard } from "../../../../components/ui/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
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
} from "../../../../components/ui/charts";
import { apiRequest } from "../../../../lib/api";

type TabAnalyticsProps = {
  knowledgeBaseId: string;
};

const RANGE_OPTIONS = [
  { value: "today", label: "今天" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
];

export function TabAnalytics({ knowledgeBaseId }: TabAnalyticsProps) {
  const [range, setRange] = useState("7d");
  const [data, setData] = useState<KnowledgeBaseAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/analytics?range=${range}`,
        knowledgeBaseAnalyticsResponseSchema,
        { cache: "no-store" },
      );
      setData(response);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载统计数据失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, range]);

  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  // 指标「本期 vs 上期」对比柱状数据（接口给的是聚合值，非逐日序列，如实呈现对比）。
  const trendCompareData = useMemo(() => {
    if (data === null) return [];
    const { trends } = data;
    return [
      { metric: "访问量", 本期: trends.visits.current, 上期: trends.visits.previous },
      { metric: "搜索", 本期: trends.searches.current, 上期: trends.searches.previous },
      { metric: "提问", 本期: trends.questions.current, 上期: trends.questions.previous },
      { metric: "活跃用户", 本期: trends.activeUsers.current, 上期: trends.activeUsers.previous },
    ];
  }, [data]);

  // 反馈分布饼图数据（过滤掉 0 值，避免空扇区；fill 走 token 色，逐扇区着色）。
  const feedbackPieData = useMemo(() => {
    if (data === null) return [];
    const { feedback } = data;
    return [
      { name: "有用", value: feedback.answerUseful },
      { name: "无用", value: feedback.answerNotUseful },
      { name: "纠错", value: feedback.answerCorrections },
      { name: "条目赞", value: feedback.knowledgeItemLikes },
      { name: "条目踩", value: feedback.knowledgeItemDislikes },
    ]
      .filter((entry) => entry.value > 0)
      .map((entry, index) => ({ ...entry, fill: chartColor(index) }));
  }, [data]);

  // 热门文档浏览量柱状（取前 8，按浏览量倒序，标题截断）。
  const popularDocChartData = useMemo(() => {
    if (data === null) return [];
    return [...data.popularDocuments]
      .sort((a, b) => b.views - a.views)
      .slice(0, 8)
      .map((doc) => ({ name: truncate(doc.title, 14), 浏览: doc.views, 引用: doc.citations }));
  }, [data]);

  // 热门搜索关键词柱状（取前 10，按搜索次数倒序，关键词截断）。
  const topKeywordsChartData = useMemo(() => {
    if (data === null) return [];
    return [...data.topKeywords]
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((kw) => ({ name: truncate(kw.keyword, 14), 搜索次数: kw.count }));
  }, [data]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">{error}</p>;
  }

  if (!data) return null;

  const { metrics, trends, popularDocuments, popularKnowledgeItems, topKeywords, feedback, feedbackReasons, noAnswerQuestions, lowConfidenceQuestions } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* Range 切换 */}
      <div role="radiogroup" aria-label="时间范围" className="flex items-center gap-1 rounded-lg border border-border bg-neutral-50 p-1 w-fit">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={range === opt.value}
            onClick={() => setRange(opt.value)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              range === opt.value
                ? "bg-surface text-brand-700 shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 指标卡 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="访问量"
          value={metrics.visits}
          trend={{ current: trends.visits.current, previous: trends.visits.previous }}
        />
        <MetricCard
          label="搜索次数"
          value={metrics.searches}
          trend={{ current: trends.searches.current, previous: trends.searches.previous }}
        />
        <MetricCard
          label="提问次数"
          value={metrics.questions}
          trend={{ current: trends.questions.current, previous: trends.questions.previous }}
        />
        <MetricCard
          label="活跃用户"
          value={metrics.activeUsers}
          trend={{ current: trends.activeUsers.current, previous: trends.activeUsers.previous }}
        />
      </div>

      {/* 本期 vs 上期对比 */}
      <ChartFrame title="活跃趋势（本期 vs 上期）" height={260}>
        <ResponsiveContainer>
          <BarChart data={trendCompareData} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" {...GRID_STYLE} vertical={false} />
            <XAxis dataKey="metric" tick={AXIS_TICK_STYLE} axisLine={AXIS_LINE_STYLE} tickLine={false} />
            <YAxis allowDecimals={false} tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ fill: "var(--color-neutral-100)" }}
            />
            <Legend wrapperStyle={LEGEND_STYLE} />
            <Bar dataKey="上期" fill="var(--color-neutral-300)" radius={[4, 4, 0, 0]} maxBarSize={36} />
            <Bar dataKey="本期" fill={chartColor(0)} radius={[4, 4, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>

      {/* 反馈分布饼图 */}
      <section>
        <h3 className="text-md font-medium text-ink mb-3">反馈分布</h3>
        {feedbackPieData.length === 0 ? (
          <EmptyState title="暂无反馈数据" description="该时间范围内还没有用户反馈。" />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartFrame height={240}>
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={feedbackPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                    stroke="var(--color-surface)"
                    strokeWidth={2}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_CONTENT_STYLE}
                    labelStyle={TOOLTIP_LABEL_STYLE}
                    itemStyle={TOOLTIP_ITEM_STYLE}
                  />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 self-center">
              <FeedbackStat label="有用" value={feedback.answerUseful} />
              <FeedbackStat label="无用" value={feedback.answerNotUseful} />
              <FeedbackStat label="纠错" value={feedback.answerCorrections} />
              <FeedbackStat label="条目赞" value={feedback.knowledgeItemLikes} />
              <FeedbackStat label="条目踩" value={feedback.knowledgeItemDislikes} />
            </div>
          </div>
        )}
      </section>

      {/* 热门文档柱状 */}
      {popularDocChartData.length > 0 ? (
        <ChartFrame title="热门文档浏览/引用" height={280}>
          <ResponsiveContainer>
            <BarChart
              data={popularDocChartData}
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
                width={104}
              />
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={TOOLTIP_LABEL_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                cursor={{ fill: "var(--color-neutral-100)" }}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <Bar dataKey="浏览" fill={chartColor(0)} radius={[0, 4, 4, 0]} maxBarSize={18} />
              <Bar dataKey="引用" fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      ) : null}

      {/* 热门文档 */}
      {popularDocuments.length > 0 ? (
        <section>
          <h3 className="text-md font-medium text-ink mb-3">热门文档</h3>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>文档</TableHeaderCell>
                <TableHeaderCell>浏览</TableHeaderCell>
                <TableHeaderCell>引用</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {popularDocuments.slice(0, 10).map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium truncate max-w-xs">{doc.title}</TableCell>
                  <TableCell className="text-ink-muted">{doc.views}</TableCell>
                  <TableCell className="text-ink-muted">{doc.citations}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* 热门知识条目 */}
      {popularKnowledgeItems.length > 0 ? (
        <section>
          <h3 className="text-md font-medium text-ink mb-3">热门知识条目</h3>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>条目</TableHeaderCell>
                <TableHeaderCell>浏览</TableHeaderCell>
                <TableHeaderCell>引用</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {popularKnowledgeItems.slice(0, 10).map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium truncate max-w-xs">{item.title}</TableCell>
                  <TableCell className="text-ink-muted">{item.views}</TableCell>
                  <TableCell className="text-ink-muted">{item.citations}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* 热门搜索关键词 */}
      <section>
        <h3 className="text-md font-medium text-ink mb-3">热门搜索关键词</h3>
        {topKeywords.length === 0 ? (
          <EmptyState title="暂无搜索记录" description="该时间范围内还没有知识搜索记录。" />
        ) : (
          <>
            {topKeywordsChartData.length > 0 ? (
              <ChartFrame title="搜索关键词 Top 10" height={280}>
                <ResponsiveContainer>
                  <BarChart
                    data={topKeywordsChartData}
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
                      width={104}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      labelStyle={TOOLTIP_LABEL_STYLE}
                      itemStyle={TOOLTIP_ITEM_STYLE}
                      cursor={{ fill: "var(--color-neutral-100)" }}
                    />
                    <Bar dataKey="搜索次数" fill={chartColor(1)} radius={[0, 4, 4, 0]} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            ) : null}
            <Table className="mt-3">
              <TableHead>
                <tr>
                  <TableHeaderCell>关键词</TableHeaderCell>
                  <TableHeaderCell>搜索次数</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {topKeywords.slice(0, 10).map((kw) => (
                  <TableRow key={kw.keyword}>
                    <TableCell className="font-medium truncate max-w-xs">{kw.keyword}</TableCell>
                    <TableCell className="text-ink-muted">{kw.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </section>

      {/* 反馈原因 */}
      {feedbackReasons.length > 0 ? (
        <section>
          <h3 className="text-md font-medium text-ink mb-3">反馈原因</h3>
          <div className="flex flex-wrap gap-2">
            {feedbackReasons.map((r) => (
              <span key={r.reason} className="rounded-md bg-neutral-100 px-3 py-1 text-sm text-ink-muted">
                {r.reason} ({r.count})
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {/* 低可信度问题 */}
      {lowConfidenceQuestions.length > 0 ? (
        <section>
          <h3 className="text-md font-medium text-ink mb-3">低可信度问题</h3>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>问题</TableHeaderCell>
                <TableHeaderCell>次数</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {lowConfidenceQuestions.slice(0, 10).map((q, i) => (
                <TableRow key={i}>
                  <TableCell className="truncate max-w-md">{q.question}</TableCell>
                  <TableCell className="text-ink-muted">{q.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      {/* 无答案问题 */}
      {noAnswerQuestions.length > 0 ? (
        <section>
          <h3 className="text-md font-medium text-ink mb-3">无答案问题</h3>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>问题</TableHeaderCell>
                <TableHeaderCell>次数</TableHeaderCell>
                <TableHeaderCell>类型</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {noAnswerQuestions.slice(0, 10).map((q, i) => (
                <TableRow key={i}>
                  <TableCell className="truncate max-w-md">{q.question}</TableCell>
                  <TableCell className="text-ink-muted">{q.count}</TableCell>
                  <TableCell className="text-ink-muted text-xs">{q.noAnswerType ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}
    </div>
  );
}

function FeedbackStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-2xl font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
