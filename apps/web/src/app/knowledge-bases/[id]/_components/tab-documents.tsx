"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CSRF_HEADER_NAME,
  documentListResponseSchema,
  documentSchema,
  type KnowledgeDocument,
  type DocumentProgressEvent,
} from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Dialog } from "../../../../components/ui/dialog";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Input } from "../../../../components/ui/input";
import { Select } from "../../../../components/ui/select";
import { TagBadge } from "../../../../components/ui/tag-badge";
import { apiRequest, apiUrl, emptyObjectSchema, getCsrfToken, parseApiError, replaceDocumentTags } from "../../../../lib/api";
import { useDocumentProgress } from "../_hooks/use-document-progress";
import { useTagFilter } from "../_hooks/use-tag-filter";
import { useTags } from "../_hooks/use-tags";
import { Pagination } from "./pagination";
import { TagFilterPopover } from "./tag-filter-popover";
import { TagManagerDialog } from "./tag-manager-dialog";
import { TagPickerPopover } from "./tag-picker-popover";

type TabDocumentsProps = {
  knowledgeBaseId: string;
  canManage: boolean;
};

const STATUS_OPTIONS = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "等待中" },
  { value: "parsing", label: "解析中" },
  { value: "chunking", label: "切分中" },
  { value: "embedding", label: "向量化中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

const statusBadgeTone: Record<string, "neutral" | "info" | "success" | "warning" | "danger"> = {
  pending: "neutral",
  parsing: "info",
  chunking: "info",
  embedding: "info",
  completed: "success",
  failed: "danger",
};

const statusLabels: Record<string, string> = {
  pending: "等待中",
  parsing: "解析中",
  chunking: "切分中",
  embedding: "向量化中",
  completed: "已完成",
  failed: "失败",
};

export function TabDocuments({ knowledgeBaseId, canManage }: TabDocumentsProps) {
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const {
    tags: allTags,
    loading: tagsLoading,
    create: createTag,
    update: updateTagFn,
    remove: removeTag,
  } = useTags(knowledgeBaseId);
  const tagFilter = useTagFilter();

  const pageSize = 20;

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (keyword.trim()) params.set("keyword", keyword.trim());
      if (status) params.set("status", status);
      if (tagFilter.queryValue) params.set("tagIds", tagFilter.queryValue);
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/documents?${params.toString()}`,
        documentListResponseSchema,
        { cache: "no-store" },
      );
      setDocuments(response.items);
      setTotal(response.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载文档失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId, page, keyword, status, tagFilter.queryValue]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const progressMap = useDocumentProgress(documents, () => void loadDocuments());

  function handleKeywordChange(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setKeyword(value);
      setPage(1);
    }, 300);
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setActionError("请选择文件");
      return;
    }

    setIsUploading(true);
    setActionError(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      const response = await fetch(
        apiUrl(`/knowledge-bases/${knowledgeBaseId}/documents`),
        {
          method: "POST",
          headers: { [CSRF_HEADER_NAME]: getCsrfToken() },
          body: formData,
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error(await parseApiError(response));
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("ok" in body) || body.ok !== true || !("data" in body)) {
        throw new Error("响应格式无效");
      }
      documentSchema.parse(body.data);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadDocuments();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleReprocess(docId: string) {
    setActionError(null);
    try {
      await apiRequest(
        `/documents/${docId}/reprocess`,
        emptyObjectSchema,
        { method: "POST" },
      );
      await loadDocuments();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "重试失败");
    }
  }

  async function handleDelete(docId: string) {
    setActionError(null);
    setDeleteTarget(null);
    try {
      await apiRequest(`/documents/${docId}`, emptyObjectSchema, { method: "DELETE" });
      await loadDocuments();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  // 打标签：全量替换，用返回的标签列表更新该行
  async function handleReplaceDocTags(docId: string, tagIds: string[]) {
    const updated = await replaceDocumentTags(docId, { tagIds });
    setDocuments((prev) =>
      prev.map((doc) => (doc.id === docId ? { ...doc, tags: updated.items } : doc)),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <Input
            placeholder="搜索文档名..."
            defaultValue={keyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="max-w-xs"
          />
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="w-32"
          >
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
        {canManage ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setTagManagerOpen(true)}>
              管理标签
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.md,.markdown,.txt,.docx,.csv,.xls,.xlsx,application/pdf,text/markdown,text/plain"
              className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            <Button size="sm" loading={isUploading} onClick={() => void handleUpload()}>
              上传
            </Button>
          </div>
        ) : null}
      </div>

      {actionError ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {/* 文档列表 */}
      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : documents.length === 0 ? (
        <EmptyState
          title={tagFilter.selectedTagIds.length > 0 ? "没有符合标签筛选的文档" : "暂无文档"}
          description={tagFilter.selectedTagIds.length > 0 ? "尝试减少所选标签。" : "上传文档后将在此显示。"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              progress={progressMap[doc.id]}
              canManage={canManage}
              allTags={allTags}
              onReprocess={() => void handleReprocess(doc.id)}
              onDelete={() => setDeleteTarget(doc.id)}
              onReplaceTags={handleReplaceDocTags}
            />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="确认删除"
        description="删除后文档数据无法恢复，确定要删除吗？"
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" onClick={() => { if (deleteTarget) void handleDelete(deleteTarget); }}>
            确认删除
          </Button>
        </div>
      </Dialog>

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

function DocumentRow({
  doc,
  progress,
  canManage,
  allTags,
  onReprocess,
  onDelete,
  onReplaceTags,
}: {
  doc: KnowledgeDocument;
  progress: DocumentProgressEvent | undefined;
  canManage: boolean;
  allTags: KnowledgeDocument["tags"];
  onReprocess: () => void;
  onDelete: () => void;
  onReplaceTags: (docId: string, tagIds: string[]) => Promise<void>;
}) {
  const percent = progress?.percent ?? statusPercent(doc.processStatus);
  const message = progress?.message ?? doc.errorMessage ?? statusLabels[doc.processStatus] ?? doc.processStatus;
  const tone = statusBadgeTone[doc.processStatus] ?? "neutral";
  const isActive = !["completed", "failed"].includes(doc.processStatus);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
        <p className="text-xs text-ink-muted mt-0.5">
          {doc.sourceType} · {formatBytes(doc.fileSize)} · {doc.uploaderName}
        </p>
        {/* 标签区：canManage 可打标签（写）；member 仅只读展示已有标签 */}
        <div className="mt-1.5">
          {canManage ? (
            <TagPickerPopover
              allTags={allTags}
              selectedTagIds={doc.tags.map((tag) => tag.id)}
              onChange={(tagIds) => onReplaceTags(doc.id, tagIds)}
            >
              <button
                type="button"
                className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border border-dashed border-transparent px-1 py-0.5 text-left transition-colors hover:border-border hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                aria-label="编辑标签"
              >
                {doc.tags.length > 0 ? (
                  <>
                    {doc.tags.slice(0, 3).map((tag) => (
                      <TagBadge key={tag.id} tag={tag} />
                    ))}
                    {doc.tags.length > 3 ? (
                      <span className="text-xs text-ink-subtle">+{doc.tags.length - 3}</span>
                    ) : null}
                  </>
                ) : (
                  <span className="text-xs text-ink-subtle">+ 添加标签</span>
                )}
              </button>
            </TagPickerPopover>
          ) : doc.tags.length > 0 ? (
            <div className="inline-flex max-w-full flex-wrap items-center gap-1 px-1 py-0.5">
              {doc.tags.slice(0, 3).map((tag) => (
                <TagBadge key={tag.id} tag={tag} />
              ))}
              {doc.tags.length > 3 ? (
                <span className="text-xs text-ink-subtle">+{doc.tags.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
        {isActive ? (
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-neutral-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${String(percent)}%` }}
              />
            </div>
            <span className="text-xs text-ink-subtle shrink-0">{percent}%</span>
          </div>
        ) : null}
        {doc.processStatus === "failed" ? (
          <p className="text-xs text-danger mt-1">{message}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone={tone}>{statusLabels[doc.processStatus] ?? doc.processStatus}</Badge>
        {canManage && doc.processStatus === "failed" ? (
          <Button variant="secondary" size="sm" onClick={onReprocess}>
            重试
          </Button>
        ) : null}
        {canManage ? (
          <Button variant="ghost" size="sm" onClick={onDelete}>
            删除
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function statusPercent(status: string): number {
  switch (status) {
    case "pending": return 5;
    case "parsing": return 20;
    case "chunking": return 45;
    case "embedding": return 70;
    case "completed": return 100;
    case "failed": return 100;
    default: return 0;
  }
}

function formatBytes(value: number | null): string {
  if (value === null) return "未知大小";
  if (value < 1024) return `${String(value)} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
