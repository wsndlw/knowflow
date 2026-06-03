import { useCallback, useEffect, useState } from "react";
import {
  type ImprovementTask,
  type ImprovementTaskStats,
  improvementTaskListResponseSchema,
  improvementTaskStatsSchema,
  improvementTaskSchema,
  knowledgeItemSchema,
} from "@knowflow/shared";
import { apiRequest } from "../../../../lib/api";

export function useImprovementTasks(knowledgeBaseId: string) {
  const [tasks, setTasks] = useState<ImprovementTask[]>([]);
  const [stats, setStats] = useState<ImprovementTaskStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [triggerType, setTriggerType] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load stats
      const statsData = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/improvement-tasks/stats`,
        improvementTaskStatsSchema,
      );
      setStats(statsData);

      // Load tasks
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      if (triggerType) params.set("triggerType", triggerType);

      const tasksData = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/improvement-tasks?${params.toString()}`,
        improvementTaskListResponseSchema,
      );
      setTasks(tasksData.items);
      setTotal(tasksData.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载数据失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, page, status, triggerType]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function approveTask(taskId: string, data: { title?: string; content?: string; summary?: string | null }) {
    await apiRequest(
      `/improvement-tasks/${taskId}/approve`,
      {
        parse: (input: unknown) => {
          const payload = input as { task?: unknown; knowledgeItem?: unknown } | null | undefined;
          return {
            task: improvementTaskSchema.parse(payload?.task),
            knowledgeItem: knowledgeItemSchema.parse(payload?.knowledgeItem),
          };
        },
      },
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    );
    void loadData();
  }

  async function rejectTask(taskId: string, reason: string) {
    await apiRequest(`/improvement-tasks/${taskId}/reject`, improvementTaskSchema, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    void loadData();
  }

  return {
    tasks,
    stats,
    total,
    page,
    pageSize,
    status,
    triggerType,
    loading,
    error,
    setPage,
    setStatus,
    setTriggerType,
    approveTask,
    rejectTask,
    reload: loadData,
  };
}
