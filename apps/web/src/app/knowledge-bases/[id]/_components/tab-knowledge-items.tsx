"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  knowledgeItemFeedbackRequestSchema,
  knowledgeItemListResponseSchema,
  knowledgeItemSchema,
  type KnowledgeItem,
} from "@knowflow/shared";
import { ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
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
import { BatchImportDialog } from "./dialogs/batch-import-dialog";

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
  { value: "archived", label: "已归档" },
  { value: "expired", label: "已过期" },
];

const statusTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  draft: "neutral",
  pending_review: "info",
  published: "success",
  unpublished: "warning",
  archived: "neutral",
  expired: "danger",
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  unpublished: "已下架",
  archived: "已归档",
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
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionTarget, setActionTarget] = useState<{ ids: string[], type: "archive" | "delete" } | null>(null);
  const [actioning, setActioning] = useState(false);
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
    // 创建返回完整 knowledgeItem（非空对象），同样不能用 emptyObjectSchema。
    await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/knowledge-items`,
      knowledgeItemSchema,
      { method: "POST", body: JSON.stringify(data) },
    );
    await loadItems();
  }

  async function handleUpdate(data: { title: string; content: string; summary: string | null }) {
    if (!editing) return;
    // PATCH 返回完整 knowledgeItem（非空对象）；用 emptyObjectSchema 会误抛"响应格式无效"。
    await apiRequest(
      `/knowledge-items/${editing.id}`,
      knowledgeItemSchema,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    await loadItems();
  }

  async function handleToggleStatus(item: KnowledgeItem) {
    const newStatus = item.status === "published" ? "unpublished" : "published";
    // 走专用端点（POST publish/unpublish）：响应为完整 item，且带 @AuditLog 记录到操作日志。
    const action = newStatus === "published" ? "publish" : "unpublish";
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: newStatus } : i)));
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${item.id}/${action}`, knowledgeItemSchema, {
        method: "POST",
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
      await apiRequest(`/knowledge-items/${item.id}`, knowledgeItemSchema, {
        method: "PATCH",
        body: JSON.stringify({ enabled: newEnabled }),
      });
    } catch (caught) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, enabled: item.enabled } : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleToggleFeedback(item: KnowledgeItem, rating: "like" | "dislike") {
    const newRating = item.userFeedback === rating ? null : rating;
    const payload = knowledgeItemFeedbackRequestSchema.parse({ rating: newRating });
    const prev = item;

    setItems((prevItems) =>
      prevItems.map((i) => {
        if (i.id === item.id) {
          let newLikeCount = i.likeCount;
          let newDislikeCount = i.dislikeCount;
          if (i.userFeedback === "like") newLikeCount--;
          if (i.userFeedback === "dislike") newDislikeCount--;
          if (newRating === "like") newLikeCount++;
          if (newRating === "dislike") newDislikeCount++;
          return { ...i, userFeedback: newRating, likeCount: newLikeCount, dislikeCount: newDislikeCount };
        }
        return i;
      }),
    );
    setActionError(null);
    try {
      const updated = await apiRequest(`/knowledge-items/${item.id}/feedback`, knowledgeItemSchema, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setItems((prevItems) => prevItems.map((i) => (i.id === item.id ? updated : i)));
    } catch (caught) {
      setItems((prevItems) => prevItems.map((i) => (i.id === item.id ? prev : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleArchive(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "archived" } : i)));
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${id}/archive`, knowledgeItemSchema, { method: "POST" });
      await loadItems();
    } catch (caught) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: item.status } : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleRestore(id: string) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: "unpublished" } : i)));
    setActionError(null);
    try {
      await apiRequest(`/knowledge-items/${id}/restore`, knowledgeItemSchema, { method: "POST" });
      await loadItems();
    } catch (caught) {
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: item.status } : i)));
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleConfirmAction() {
    if (!actionTarget) return;
    setActioning(true);
    setActionError(null);
    try {
      for (const id of actionTarget.ids) {
        if (actionTarget.type === "archive") {
          await apiRequest(`/knowledge-items/${id}/archive`, knowledgeItemSchema, { method: "POST" });
        } else {
          await apiRequest(`/knowledge-items/${id}`, emptyObjectSchema, { method: "DELETE" });
        }
      }
      setActionTarget(null);
      setSelected(new Set());
      await loadItems();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setActioning(false);
    }
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allSelected = items.length > 0 && selected.size === items.length;
  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
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
            <Button variant="outline" size="sm" onClick={() => setBatchImportOpen(true)}>
              批量导入
            </Button>
          ) : null}
          {canManage ? (
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              新建条目
            </Button>
          ) : null}
        </div>
      </div>

      {canManage && selected.size > 0 ? (
        <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-3 py-2">
          <span className="text-sm text-ink">
            已选 <span className="font-medium tabular-nums">{selected.size}</span> 项
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              取消选择
            </Button>
            {status === "archived" ? (
              <Button variant="destructive" size="sm" onClick={() => setActionTarget({ ids: [...selected], type: "delete" })}>
                批量删除
              </Button>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setActionTarget({ ids: [...selected], type: "archive" })}>
                批量归档
              </Button>
            )}
          </div>
        </div>
      ) : null}
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
            <TableRow>
              {canManage ? (
                <TableHeaderCell className="w-10">
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 cursor-pointer accent-brand-600"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="全选"
                  />
                </TableHeaderCell>
              ) : null}
              <TableHeaderCell>标题</TableHeaderCell>
              <TableHeaderCell>标签</TableHeaderCell>
              <TableHeaderCell>状态</TableHeaderCell>
              <TableHeaderCell>启用</TableHeaderCell>
              <TableHeaderCell>引用</TableHeaderCell>
              <TableHeaderCell>反馈</TableHeaderCell>
              <TableHeaderCell>更新时间</TableHeaderCell>
              {canManage ? <TableHeaderCell className="text-right">操作</TableHeaderCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                {canManage ? (
                  <TableCell className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 cursor-pointer accent-brand-600"
                      checked={selected.has(item.id)}
                      onChange={() => toggleRow(item.id)}
                      aria-label={`选择 ${item.title}`}
                    />
                  </TableCell>
                ) : null}
                <TableCell className="font-medium max-w-xs truncate">{item.title}</TableCell>
                <TableCell>
                  {canManage ? (
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
                  ) : item.tags.length > 0 ? (
                    <div className="inline-flex max-w-[220px] flex-wrap items-center gap-1 px-1 py-0.5">
                      {item.tags.slice(0, 3).map((tag) => (
                        <TagBadge key={tag.id} tag={tag} />
                      ))}
                      {item.tags.length > 3 ? (
                        <span className="text-xs text-ink-subtle">+{item.tags.length - 3}</span>
                      ) : null}
                    </div>
                  ) : (
                    <span className="text-xs text-ink-subtle">-</span>
                  )}
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
                <TableCell className="text-ink-muted tabular-nums">{item.citeCount}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleToggleFeedback(item, "like")}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
                        item.userFeedback === "like"
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-subtle hover:bg-neutral-100 hover:text-ink"
                      }`}
                      aria-label="赞"
                    >
                      <ThumbsUp className="size-3.5" />
                      <span className="tabular-nums font-medium">{item.likeCount}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleToggleFeedback(item, "dislike")}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors duration-150 ${
                        item.userFeedback === "dislike"
                          ? "bg-brand-50 text-brand-700"
                          : "text-ink-subtle hover:bg-neutral-100 hover:text-ink"
                      }`}
                      aria-label="踩"
                    >
                      <ThumbsDown className="size-3.5" />
                      <span className="tabular-nums font-medium">{item.dislikeCount}</span>
                    </button>
                  </div>
                </TableCell>
                <TableCell className="text-ink-muted text-xs tabular-nums">{formatDate(item.updatedAt)}</TableCell>
                {canManage ? (
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {item.status === "archived" ? (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => void handleRestore(item.id)}>
                            恢复
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setActionTarget({ ids: [item.id], type: "delete" })}>
                            彻底删除
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                            编辑
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleToggleStatus(item)}>
                            {item.status === "published" ? "下架" : "发布"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleArchive(item.id)}>
                            归档
                          </Button>
                        </>
                      )}
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

      <BatchImportDialog
        open={batchImportOpen}
        onClose={() => setBatchImportOpen(false)}
        knowledgeBaseId={knowledgeBaseId}
        onSuccess={loadItems}
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

      <Dialog
        open={actionTarget !== null}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.type === "archive" ? "确认归档" : "确认删除"}
        description={
          actionTarget
            ? actionTarget.type === "archive"
              ? `确定归档选中的 ${String(actionTarget.ids.length)} 条知识条目吗？归档后默认隐藏，可在『已归档』恢复或彻底删除。`
              : `确定彻底删除选中的 ${String(actionTarget.ids.length)} 条知识条目吗？删除后无法恢复。`
            : ""
        }
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setActionTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" loading={actioning} onClick={() => void handleConfirmAction()}>
            {actionTarget?.type === "archive" ? "确认归档" : "确认删除"}
          </Button>
        </div>
      </Dialog>
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
