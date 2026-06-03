"use client";

import { useCallback, useMemo, useState } from "react";

export type UseTagFilter = {
  selectedTagIds: string[];
  toggle: (tagId: string) => void;
  clear: () => void;
  isSelected: (tagId: string) => boolean;
  /** 逗号分隔，用于列表接口 ?tagIds= 查询（AND 语义） */
  queryValue: string;
};

/**
 * 列表标签筛选选中态。多选 AND：选中的 tagId 逗号拼接传给列表接口。
 */
export function useTagFilter(): UseTagFilter {
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const toggle = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  }, []);

  const clear = useCallback(() => {
    setSelectedTagIds([]);
  }, []);

  const isSelected = useCallback(
    (tagId: string) => selectedTagIds.includes(tagId),
    [selectedTagIds],
  );

  const queryValue = useMemo(() => selectedTagIds.join(","), [selectedTagIds]);

  return { selectedTagIds, toggle, clear, isSelected, queryValue };
}
