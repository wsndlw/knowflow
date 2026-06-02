"use client";

import { useCallback, useEffect, useState } from "react";
import {
  knowledgeBaseAnalyticsResponseSchema,
  type KnowledgeBaseAnalyticsResponse,
} from "@knowflow/shared";

import { Skeleton } from "../../../../components/ui/feedback";
import { MetricCard } from "../../../../components/ui/metric-card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
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

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>;
  }

  if (!data) return null;

  const { metrics, trends, popularDocuments, popularKnowledgeItems, feedback, feedbackReasons, noAnswerQuestions, lowConfidenceQuestions } = data;

  return (
    <div className="flex flex-col gap-6">
      {/* Range 切换 */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-neutral-50 p-1 w-fit">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
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

      {/* 反馈分布 */}
      <section>
        <h3 className="text-md font-medium text-ink mb-3">反馈分布</h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <FeedbackStat label="有用" value={feedback.answerUseful} />
          <FeedbackStat label="无用" value={feedback.answerNotUseful} />
          <FeedbackStat label="纠错" value={feedback.answerCorrections} />
          <FeedbackStat label="条目赞" value={feedback.knowledgeItemLikes} />
          <FeedbackStat label="条目踩" value={feedback.knowledgeItemDislikes} />
        </div>
      </section>

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
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-center">
      <p className="text-lg font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}
