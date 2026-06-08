"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  auditLogListResponseSchema,
  type AuditLogEntry,
  type AuditResult,
} from "@knowflow/shared";

import { apiRequest } from "../../../../lib/api";
import { translateApiError } from "../../../../lib/api-error";

export type AuditTimePreset = "7d" | "30d" | "all" | "custom";

export type AuditLogFilters = {
  /** 操作类型 action，多选(OR) */
  actions: string[];
  /** 操作者 userId，单选；空串表示全部 */
  userId: string;
  /** 结果，单选；undefined 表示全部 */
  result: AuditResult | "";
  /** ISO datetime 起始，空串表示不限 */
  from: string;
  /** ISO datetime 结束，空串表示不限 */
  to: string;
  /** 时间范围预设（仅前端显示态，不参与查询；避免跨天用绝对日期反推导致高亮漂移） */
  timePreset: AuditTimePreset;
};

export const EMPTY_AUDIT_FILTERS: AuditLogFilters = {
  actions: [],
  userId: "",
  result: "",
  from: "",
  to: "",
  timePreset: "all",
};

const PAGE_SIZE = 20;

type UseAuditLogsReturn = {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
  filters: AuditLogFilters;
  setFilters: (next: AuditLogFilters) => void;
  setPage: (page: number) => void;
  reload: () => Promise<void>;
};

function buildQuery(filters: AuditLogFilters, page: number, pageSize: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (filters.actions.length > 0) {
    params.set("action", filters.actions.join(","));
  }
  if (filters.userId) {
    params.set("userId", filters.userId);
  }
  if (filters.result) {
    params.set("result", filters.result);
  }
  if (filters.from) {
    params.set("from", filters.from);
  }
  if (filters.to) {
    params.set("to", filters.to);
  }
  return params.toString();
}

export function useAuditLogs(knowledgeBaseId: string): UseAuditLogsReturn {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPageState] = useState(1);
  const [filters, setFiltersState] = useState<AuditLogFilters>(EMPTY_AUDIT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++loadRequestIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const query = buildQuery(filters, page, PAGE_SIZE);
      const data = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/audit-logs?${query}`,
        auditLogListResponseSchema,
        { cache: "no-store" },
      );
      if (reqId !== loadRequestIdRef.current) return;
      setItems(data.items);
      setTotal(data.total);
    } catch (caught) {
      if (reqId !== loadRequestIdRef.current) return;
      setError(caught instanceof Error ? translateApiError(caught.message) : "加载操作日志失败");
      setItems([]);
      setTotal(0);
    } finally {
      if (reqId === loadRequestIdRef.current) setLoading(false);
    }
  }, [knowledgeBaseId, filters, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFilters = useCallback((next: AuditLogFilters) => {
    setFiltersState(next);
    setPageState(1); // 改筛选条件回到第一页
  }, []);

  const setPage = useCallback((next: number) => {
    setPageState(next);
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    items,
    total,
    page,
    pageSize: PAGE_SIZE,
    totalPages,
    loading,
    error,
    filters,
    setFilters,
    setPage,
    reload: load,
  };
}
