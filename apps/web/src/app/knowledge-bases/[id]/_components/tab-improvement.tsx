"use client";

import { useState } from "react";
import { type ImprovementTask } from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import { Textarea } from "../../../../components/ui/textarea";
import { useImprovementTasks } from "../_hooks/use-improvement-tasks";
import { Pagination } from "./pagination";

export function TabImprovement({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const {
    tasks,
    stats,
    total,
    page,
    pageSize,
    status,
    source,
    loading,
    error,
    setPage,
    setStatus,
    setSource,
    approveTask,
    rejectTask,
  } = useImprovementTasks(knowledgeBaseId);

  const [selectedTask, setSelectedTask] = useState<ImprovementTask | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleApprove = async (task: ImprovementTask) => {
    setIsApproving(true);
    setActionError(null);
    try {
      const data: { title?: string; content?: string; summary?: string | null } = { summary: task.candidateSummary };
      if (task.candidateTitle) data.title = task.candidateTitle;
      if (task.candidateContent) data.content = task.candidateContent;
      await approveTask(task.id, data);
      setSelectedTask(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "审批失败");
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async (task: ImprovementTask) => {
    if (!rejectReason.trim()) {
      setActionError("请输入驳回原因");
      return;
    }
    setIsRejecting(true);
    setActionError(null);
    try {
      await rejectTask(task.id, rejectReason);
      setSelectedTask(null);
      setRejectReason("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "驳回失败");
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {/* 状态统计卡 */}
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="待处理" value={stats.pending + stats.candidateReady} sub1={`反馈: ${String(stats.sources.feedback.pending + stats.sources.feedback.candidateReady)}`} sub2={`文档: ${String(stats.sources.document.pending + stats.sources.document.candidateReady)}`} />
          <StatCard title="已通过" value={stats.approved} sub1={`反馈: ${String(stats.sources.feedback.approved)}`} sub2={`文档: ${String(stats.sources.document.approved)}`} />
          <StatCard title="已驳回" value={stats.rejected} sub1={`反馈: ${String(stats.sources.feedback.rejected)}`} sub2={`文档: ${String(stats.sources.document.rejected)}`} />
          <StatCard title="已发布" value={stats.published} sub1={`反馈: ${String(stats.sources.feedback.published)}`} sub2={`文档: ${String(stats.sources.document.published)}`} />
        </div>
      ) : (
        <div className="flex gap-4">
          <Skeleton className="h-[88px] flex-1" />
          <Skeleton className="h-[88px] flex-1" />
          <Skeleton className="h-[88px] flex-1" />
          <Skeleton className="h-[88px] flex-1" />
        </div>
      )}

      {/* 筛选区 */}
      <div className="flex items-center gap-3">
        <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
          <option value="">全部状态</option>
          <option value="pending">生成中</option>
          <option value="processing">处理中</option>
          <option value="candidate_ready">待审核 (Candidate Ready)</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
          <option value="published">已发布</option>
          <option value="failed">处理失败</option>
        </Select>
        <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }} className="w-40">
          <option value="">全部来源</option>
          <option value="feedback">用户反馈 (Feedback)</option>
          <option value="document">文档提炼 (Document)</option>
        </Select>
      </div>

      {/* 列表区 */}
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : tasks.length === 0 ? (
        <EmptyState title="暂无改进任务" description="调整筛选条件或等待系统生成改进建议。" />
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3 hover:bg-neutral-50 transition-colors cursor-pointer"
              onClick={() => setSelectedTask(task)}
            >
              <div className="flex-1 min-w-0 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <Badge tone={task.triggerType !== "document_extraction" ? "info" : "neutral"}>
                    {task.triggerType !== "document_extraction" ? "反馈来源" : "文档来源"}
                  </Badge>
                  <p className="text-sm font-medium text-ink truncate">
                    {task.candidateTitle ?? task.sourceQuestion}
                  </p>
                </div>
                <p className="text-xs text-ink-muted truncate">
                  {task.candidateSummary ?? "暂无摘要"}
                </p>
                <p className="text-xs text-ink-subtle tabular-nums">
                  AI 信心度 {task.aiConfidence !== null ? `${(task.aiConfidence * 100).toFixed(0)}%` : "N/A"}
                </p>
              </div>
              <div className="shrink-0">
                <Badge tone={getStatusTone(task.status)}>
                  {getStatusLabel(task.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      {/* 详情与审批弹窗 */}
      <Dialog
        open={selectedTask !== null}
        onClose={() => setSelectedTask(null)}
        title="改进任务审批"
        description="审核 AI 生成的知识条目候选"
        className="max-w-2xl"
        footer={
          selectedTask ? (
            <div className="flex flex-col w-full gap-3">
              {selectedTask.status === "candidate_ready" ? (
                <>
                  <Input
                    placeholder="驳回原因（驳回时必填）"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button variant="destructive" onClick={() => void handleReject(selectedTask)} loading={isRejecting}>
                      驳回
                    </Button>
                    <Button onClick={() => void handleApprove(selectedTask)} loading={isApproving}>
                      通过并发布
                    </Button>
                  </div>
                </>
              ) : null}
              {selectedTask.status === "rejected" ? (
                <div className="text-sm text-danger bg-danger-bg px-3 py-2 rounded-md w-full text-left">
                  已驳回：{selectedTask.reviewNote}
                </div>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {selectedTask ? (
          <div className="flex flex-col gap-5 mt-2">
            {actionError ? <p className="text-sm text-danger bg-danger-bg px-3 py-2 rounded-md">{actionError}</p> : null}
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-ink-muted">来源问题/触发条件</p>
              <p className="text-sm text-ink">{selectedTask.sourceQuestion}</p>
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-muted">候选标题</p>
              <Input value={selectedTask.candidateTitle ?? ""} readOnly />
            </div>

            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-ink-muted">候选内容</p>
              <Textarea
                className="w-full min-h-[150px]"
                value={selectedTask.candidateContent ?? ""}
                readOnly
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-medium text-ink-muted">AI 推理</p>
              <p className="text-sm text-ink-muted leading-relaxed">{selectedTask.aiReasoning ?? "无"}</p>
            </div>

          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function StatCard({ title, value, sub1, sub2 }: { title: string; value: number; sub1: string; sub2: string }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-surface px-4 py-3.5">
      <p className="text-xs text-ink-muted">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-ink tabular-nums">{value}</p>
      <div className="mt-2 flex items-center gap-3 text-xs text-ink-subtle tabular-nums">
        <span>{sub1}</span>
        <span>{sub2}</span>
      </div>
    </div>
  );
}

function getStatusTone(status: string): "neutral" | "info" | "success" | "warning" | "danger" {
  switch (status) {
    case "pending": return "neutral";
    case "processing": return "info";
    case "candidate_ready": return "warning";
    case "approved": return "success";
    case "published": return "success";
    case "rejected": return "danger";
    case "failed": return "danger";
    default: return "neutral";
  }
}

function getStatusLabel(status: string): string {
  const map: Record<string, string> = {
    pending: "生成中",
    processing: "处理中",
    candidate_ready: "待审核",
    approved: "已通过",
    rejected: "已驳回",
    published: "已发布",
    failed: "处理失败",
  };
  return map[status] ?? status;
}
