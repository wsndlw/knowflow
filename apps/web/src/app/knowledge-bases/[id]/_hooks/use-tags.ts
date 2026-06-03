"use client";

import { useCallback, useEffect, useState } from "react";
import type { CreateTagRequest, KnowledgeTag, UpdateTagRequest } from "@knowflow/shared";

import {
  createKnowledgeBaseTag,
  deleteTag as deleteTagApi,
  listKnowledgeBaseTags,
  updateTag as updateTagApi,
} from "@/lib/api";

export type UseTags = {
  tags: KnowledgeTag[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  create: (body: CreateTagRequest) => Promise<KnowledgeTag>;
  update: (tagId: string, body: UpdateTagRequest) => Promise<KnowledgeTag>;
  remove: (tagId: string) => Promise<void>;
};

/**
 * 某知识库标签列表 + CRUD。CRUD 方法在成功后同步本地列表，失败抛出由调用方提示。
 */
export function useTags(knowledgeBaseId: string): UseTags {
  const [tags, setTags] = useState<KnowledgeTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listKnowledgeBaseTags(knowledgeBaseId);
      setTags(data.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载标签失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (body: CreateTagRequest) => {
      const created = await createKnowledgeBaseTag(knowledgeBaseId, body);
      setTags((prev) => [...prev, created]);
      return created;
    },
    [knowledgeBaseId],
  );

  const update = useCallback(async (tagId: string, body: UpdateTagRequest) => {
    const updated = await updateTagApi(tagId, body);
    setTags((prev) => prev.map((tag) => (tag.id === tagId ? updated : tag)));
    return updated;
  }, []);

  const remove = useCallback(async (tagId: string) => {
    await deleteTagApi(tagId);
    setTags((prev) => prev.filter((tag) => tag.id !== tagId));
  }, []);

  return { tags, loading, error, reload, create, update, remove };
}
