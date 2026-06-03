import { useCallback, useEffect, useState } from "react";
import {
  type ImprovementTask,
  type ImprovementTaskStats,
  improvementTaskListResponseSchema,
  improvementTaskStatsSchema,
  improvementTaskSchema,
  approveImprovementTaskResponseSchema,
} from "@knowflow/shared";
import { apiRequest } from "../../../../lib/api";

export function useImprovementTasks(knowledgeBaseId: string) {
  const [tasks, setTasks] = useState<ImprovementTask[]>([]);
  const [stats, setStats] = useState<ImprovementTaskStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [source, setSource] = useState<string>("");
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
      if (source) params.set("source", source);

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
  }, [knowledgeBaseId, page, status, source]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function approveTask(taskId: string, data: { title?: string; content?: string; summary?: string | null }) {
    await apiRequest(
      `/improvement-tasks/${taskId}/approve`,
      approveImprovementTaskResponseSchema,
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
    source,
    loading,
    error,
    setPage,
    setStatus,
    setSource,
    approveTask,
    rejectTask,
    reload: loadData,
  };
}
