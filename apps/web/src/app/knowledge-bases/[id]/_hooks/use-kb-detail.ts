"use client";

import { useCallback, useEffect, useState } from "react";
import {
  knowledgeBaseSchema,
  knowledgeBaseOverviewSchema,
  type KnowledgeBase,
  type KnowledgeBaseOverview,
} from "@knowflow/shared";

import { apiRequest } from "../../../../lib/api";

type UseKbDetailReturn = {
  kb: KnowledgeBase | null;
  overview: KnowledgeBaseOverview | null;
  canManage: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useKbDetail(knowledgeBaseId: string): UseKbDetailReturn {
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [overview, setOverview] = useState<KnowledgeBaseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detail, overviewData] = await Promise.all([
        apiRequest(`/knowledge-bases/${knowledgeBaseId}`, knowledgeBaseSchema, {
          cache: "no-store",
        }),
        apiRequest(
          `/knowledge-bases/${knowledgeBaseId}/overview`,
          knowledgeBaseOverviewSchema,
          { cache: "no-store" },
        ),
      ]);
      setKb(detail);
      setOverview(overviewData);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载知识库失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    kb,
    overview,
    canManage: kb?.canManage ?? false,
    loading,
    error,
    reload,
  };
}
