"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  knowledgeItemListResponseSchema,
  type KnowledgeItem,
} from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "../../../../components/ui/table";
import { TagBadge } from "../../../../components/ui/tag-badge";
import { apiRequest, emptyObjectSchema, replaceKnowledgeItemTags } from "../../../../lib/api";
import { useTagFilter } from "../_hooks/use-tag-filter";
import { useTags } from "../_hooks/use-tags";
import { Pagination } from "./pagination";
import { TagFilterPopover } from "./tag-filter-popover";
import { TagManagerDialog } from "./tag-manager-dialog";
import { TagPickerPopover } from "./tag-picker-popover";
import { KnowledgeItemDialog } from "./dialogs/knowledge-item-dialog";

type TabKnowledgeItemsProps = {
  knowledgeBaseId: string;
  canManage: boolean;
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待审核" },
  { value: "published", label: "已发布" },
  { value: "unpublished", label: "已下架" },
  { value: "expired", label: "已过期" },
];

const statusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending_review: "info",
  published: "success",
  unpublished: "warning",
  expired: "danger",
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  unpublished: "已下架",
  expired: "已过期",
};

export function TabKnowledgeItems({ knowledgeBaseId, canManage }: TabKnowledgeItemsProps) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pageSize = 20;

  const {
    tags: allTags,
    loading: tagsLoading,
    create: createTag,
    update: updateTagFn,
    remove: removeTag,
  } = useTags(knowledgeBaseId);
  const tagFilter = useTagFilter();

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status) params.set("status", status);
      if (tagFilter.queryValue) params.set("tagIds", tagFilter.queryValue);
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/knowledge-items?${params.toString()}`,
        knowledgeItemListResponseSchema,
        { cache: "no-store" },
      );
      setItems(response.items);
      setTotal(response.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, page, keyword, status, tagFilter.queryValue]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  function handleKeywordChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(value);
      setPage(1);
    }, 300);
  }

  async function handleCreate(data: { title: string; content: string; summary: string | null }) {
    await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/knowledge-items`,
      emptyObjectSchema,
      { method: "POST", body: JSON.stringify(data) },
    );
    await loadItems();
  }

  async function handleUpdate(data: { title: string; content: string; summary: string | null }) {
    if (!editing) return;
    await apiRequest(
      `/knowledge-items/${editing.id}`,
      emptyObjectSchema,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    await loadItems();
  }

  async function handleToggleStatus(item: KnowledgeItem) {
    const newStatus = item.status === "published" ? "unpublished" : "published";
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${item.id}`, emptyObjectSchema, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await loadItems();
    } catch (caught) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleToggleEnabled(item: KnowledgeItem) {
    const newEnabled = !item.enabled;
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: newEnabled } : i)));
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${item.id}`, emptyObjectSchema, {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch (caught) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: item.enabled } : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleDelete(id: string) {
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${id}`, emptyObjectSchema, { method: "DELETE" });
      await loadItems();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  // 打标签：全量替换，用返回的标签列表更新该行
  async function handleReplaceItemTags(itemId: string, tagIds: string[]) {
    const updated = await replaceKnowledgeItemTags(itemId, { tagIds });
    setItems((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, tags: updated.items } : item)),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="搜索标题..."
            defaultValue={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="max-w-xs"
          />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-32">
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <TagFilterPopover
            allTags={allTags}
            selectedTagIds={tagFilter.selectedTagIds}
            onToggle={(tagId) => { tagFilter.toggle(tagId); setPage(1); }}
            onClear={() => { tagFilter.clear(); setPage(1); }}
          />
        </div>
        <div className="flex items-center gap-2">
          {canManage ? (
            <Button variant="outline" size="sm" onClick={() => setTagManagerOpen(true)}>
              管理标签
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              新建条目
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
          <Skeleton className="h-10" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={tagFilter.selectedTagIds.length > 0 ? "没有符合标签筛选的条目" : "暂无知识条目"}
          description={tagFilter.selectedTagIds.length > 0 ? "尝试减少所选标签。" : "创建知识条目以丰富知识库内容。"}
        />
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>标题</TableHeaderCell>
              <TableHeaderCell>标签</TableHeaderCell>
              <TableHeaderCell>状态</TableHeaderCell>
              <TableHeaderCell>启用</TableHeaderCell>
              <TableHeaderCell>引用</TableHeaderCell>
              <TableHeaderCell>更新时间</TableHeaderCell>
              {canManage ? <TableHeaderCell className="text-right">操作</TableHeaderCell> : null}
            </tr>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium max-w-xs truncate">{item.title}</TableCell>
                <TableCell>
                  <TagPickerPopover
                    allTags={allTags}
                    selectedTagIds={item.tags.map((tag) => tag.id)}
                    onChange={(tagIds) => handleReplaceItemTags(item.id, tagIds)}
                  >
                    <button
                      type="button"
                      className="inline-flex max-w-[220px] flex-wrap items-center gap-1 rounded-md border border-dashed border-transparent px-1 py-0.5 text-left transition-colors hover:border-border hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                      aria-label="编辑标签"
                    >
                      {item.tags.length > 0 ? (
                        <>
                          {item.tags.slice(0, 3).map((tag) => (
                            <TagBadge key={tag.id} tag={tag} />
                          ))}
                          {item.tags.length > 3 ? (
                            <span className="text-xs text-ink-subtle">+{item.tags.length - 3}</span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs text-ink-subtle">+ 添加标签</span>
                      )}
                    </button>
                  </TagPickerPopover>
                </TableCell>
                <TableCell>
                  <Badge tone={statusTone[item.status] ?? "neutral"}>
                    {statusLabels[item.status] ?? item.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.enabled}
                      onClick={() => void handleToggleEnabled(item)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${item.enabled ? "bg-brand-500" : "bg-neutral-300"}`}
                      aria-label={item.enabled ? "禁用" : "启用"}
                    >
                      <span className={`inline-block size-3.5 transform rounded-full bg-white transition-transform ${item.enabled ? "translate-x-[18px]" : "translate-x-1"}`} />
                    </button>
                  ) : (
                    <span className="text-sm">{item.enabled ? "是" : "否"}</span>
                  )}
                </TableCell>
                <TableCell className="text-ink-muted">{item.citeCount}</TableCell>
                <TableCell className="text-ink-muted text-xs">{formatDate(item.updatedAt)}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleToggleStatus(item)}>
                        {item.status === "published" ? "下架" : "发布"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void handleDelete(item.id)}>
                        删除
                      </Button>
                    </div>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <KnowledgeItemDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSubmit={editing ? handleUpdate : handleCreate}
        editing={editing}
      />

      <TagManagerDialog
        open={tagManagerOpen}
        onOpenChange={setTagManagerOpen}
        tags={allTags}
        loading={tagsLoading}
        onCreate={createTag}
        onUpdate={updateTagFn}
        onDelete={removeTag}
      />
    </div>
  );
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
