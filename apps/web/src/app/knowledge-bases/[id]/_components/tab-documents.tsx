"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CSRF_HEADER_NAME,
  documentListResponseSchema,
  documentSchema,
  type KnowledgeDocument,
  type DocumentProgressEvent,
  createImprovementTasksResponseSchema,
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
import { DocumentPreviewDialog } from "./document-preview-dialog";

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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [extractingIds, setExtractingIds] = useState<Set<string>>(new Set());
  const [archivedMode, setArchivedMode] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<{ ids: string[] } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<{ ids: string[] } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ ids: string[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<KnowledgeDocument | null>(null);
  const [tagManagerOpen, setTagManagerOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
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
      params.set("archived", archivedMode ? "true" : "false");
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
  }, [knowledgeBaseId, page, keyword, status, tagFilter.queryValue, archivedMode]);

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
      setUploadOpen(false);
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

  async function handleConfirmArchive() {
    if (!archiveTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      for (const docId of archiveTarget.ids) {
        await apiRequest(`/documents/${docId}/archive`, emptyObjectSchema, { method: "POST" });
      }
      setArchiveTarget(null);
      setSelectedIds(new Set());
      await loadDocuments();
      setActionSuccess("归档成功");
      setTimeout(() => setActionSuccess((prev) => (prev === "归档成功" ? null : prev)), 3000);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "归档失败");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmRestore() {
    if (!restoreTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      for (const docId of restoreTarget.ids) {
        await apiRequest(`/documents/${docId}/restore`, emptyObjectSchema, { method: "POST" });
      }
      setRestoreTarget(null);
      setSelectedIds(new Set());
      await loadDocuments();
      setActionSuccess("恢复成功");
      setTimeout(() => setActionSuccess((prev) => (prev === "恢复成功" ? null : prev)), 3000);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "恢复失败");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setActionLoading(true);
    setActionError(null);
    try {
      for (const docId of deleteTarget.ids) {
        await apiRequest(`/documents/${docId}`, emptyObjectSchema, { method: "DELETE" });
      }
      setDeleteTarget(null);
      setSelectedIds(new Set());
      await loadDocuments();
      setActionSuccess("彻底删除成功");
      setTimeout(() => setActionSuccess((prev) => (prev === "彻底删除成功" ? null : prev)), 3000);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "彻底删除失败");
    } finally {
      setActionLoading(false);
    }
  }

  function toggleSelect(docId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  const allSelected = documents.length > 0 && selectedIds.size === documents.length;
  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === documents.length ? new Set() : new Set(documents.map((d) => d.id)),
    );
  }

  const handleExtract = async (documentId: string) => {
    setActionError(null);
    setActionSuccess(null);
    setExtractingIds((prev) => new Set(prev).add(documentId));
    try {
      const res = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/improvement-tasks/generate`,
        createImprovementTasksResponseSchema,
        {
          method: "POST",
          body: JSON.stringify({ documentId }),
        },
      );
      const msg =
        res.created > 0
          ? `已生成 ${String(res.created)} 条候选条目，可在『知识改进/审核台』查看审批`
          : "未生成新候选条目（可能已提炼过），可在『知识改进/审核台』查看已有条目";
      setActionSuccess(msg);
      setTimeout(() => setActionSuccess((prev) => (prev === msg ? null : prev)), 5000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "提炼失败");
    } finally {
      setExtractingIds((prev) => {
        const next = new Set(prev);
        next.delete(documentId);
        return next;
      });
    }
  };

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
          <Select
            value={archivedMode ? "archived" : "in-use"}
            onChange={(e) => {
              setArchivedMode(e.target.value === "archived");
              setPage(1);
              setSelectedIds(new Set());
            }}
            className="w-32"
          >
            <option value="in-use">在用</option>
            <option value="archived">已归档</option>
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
            <Button size="sm" onClick={() => { setActionError(null); setUploadOpen(true); }}>
              上传文档
            </Button>
          </div>
        ) : null}
      </div>

      {canManage && documents.length > 0 ? (
        <div className="flex items-center gap-3 px-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              className="size-4 shrink-0 cursor-pointer accent-brand-600"
              checked={allSelected}
              onChange={toggleAll}
            />
            全选
          </label>
          {selectedIds.size > 0 ? (
            <>
              <span className="text-sm text-ink-muted">
                已选 <span className="font-medium text-ink tabular-nums">{selectedIds.size}</span>
              </span>
              {!archivedMode ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setArchiveTarget({ ids: [...selectedIds] })}
                >
                  批量归档
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRestoreTarget({ ids: [...selectedIds] })}
                  >
                    批量恢复
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget({ ids: [...selectedIds] })}
                  >
                    批量彻底删除
                  </Button>
                </>
              )}
            </>
          ) : null}
        </div>
      ) : null}
      {actionError ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
      ) : null}
      {actionSuccess ? (
        <p className="rounded-md bg-success-bg px-3 py-2 text-sm text-success">{actionSuccess}</p>
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
              selected={selectedIds.has(doc.id)}
              onToggleSelect={() => toggleSelect(doc.id)}
              onReprocess={() => void handleReprocess(doc.id)}
              onArchive={() => setArchiveTarget({ ids: [doc.id] })}
              onRestore={() => setRestoreTarget({ ids: [doc.id] })}
              onHardDelete={() => setDeleteTarget({ ids: [doc.id] })}
              archivedMode={archivedMode}
              onReplaceTags={handleReplaceDocTags}
              onPreview={() => setPreviewTarget(doc)}
              onExtract={(docId) => void handleExtract(docId)}
              isExtracting={extractingIds.has(doc.id)}
            />
          ))}
        </div>
      )}

      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />

      <Dialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        title="确认归档"
        description={
          archiveTarget
            ? `归档后默认列表隐藏，可在『已归档』视图恢复或彻底删除。确定归档选中的 ${String(archiveTarget.ids.length)} 个文档吗？`
            : ""
        }
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setArchiveTarget(null)}>
            取消
          </Button>
          <Button loading={actionLoading} onClick={() => void handleConfirmArchive()}>
            确认归档
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={restoreTarget !== null}
        onClose={() => setRestoreTarget(null)}
        title="确认恢复"
        description={
          restoreTarget
            ? `确定恢复选中的 ${String(restoreTarget.ids.length)} 个文档吗？`
            : ""
        }
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setRestoreTarget(null)}>
            取消
          </Button>
          <Button loading={actionLoading} onClick={() => void handleConfirmRestore()}>
            确认恢复
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="确认彻底删除"
        description={
          deleteTarget
            ? `删除后将级联删除该文档的所有解析切分数据及原文件，数据不可恢复！确定彻底删除选中的 ${String(deleteTarget.ids.length)} 个文档吗？`
            : ""
        }
      >
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            取消
          </Button>
          <Button variant="destructive" loading={actionLoading} onClick={() => void handleConfirmDelete()}>
            彻底删除
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title="上传文档"
        description="支持 PDF、Markdown、TXT、DOCX、CSV、Excel、PNG/JPG/WebP 图片。"
      >
        <div className="flex flex-col gap-4 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.md,.markdown,.txt,.docx,.csv,.xls,.xlsx,.png,.jpg,.jpeg,.webp,application/pdf,text/markdown,text/plain,image/png,image/jpeg,image/webp"
            className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
          />
          {actionError ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setUploadOpen(false)}>
              取消
            </Button>
            <Button loading={isUploading} onClick={() => void handleUpload()}>
              确定上传
            </Button>
          </div>
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
      
      <DocumentPreviewDialog 
        doc={previewTarget} 
        onClose={() => setPreviewTarget(null)} 
      />
    </div>
  );
}

function DocumentRow({
  doc,
  progress,
  canManage,
  allTags,
  selected,
  onToggleSelect,
  onReprocess,
  onArchive,
  onRestore,
  onHardDelete,
  archivedMode,
  onReplaceTags,
  onPreview,
  onExtract,
  isExtracting,
}: {
  doc: KnowledgeDocument;
  progress: DocumentProgressEvent | undefined;
  canManage: boolean;
  allTags: KnowledgeDocument["tags"];
  selected: boolean;
  onToggleSelect: () => void;
  onReprocess: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onHardDelete: () => void;
  archivedMode: boolean;
  onReplaceTags: (docId: string, tagIds: string[]) => Promise<void>;
  onPreview: () => void;
  onExtract: (docId: string) => void;
  isExtracting: boolean;
}) {
  const percent = progress?.percent ?? statusPercent(doc.processStatus);
  const message = progress?.message ?? doc.errorMessage ?? statusLabels[doc.processStatus] ?? doc.processStatus;
  const tone = statusBadgeTone[doc.processStatus] ?? "neutral";
  const isActive = !["completed", "failed"].includes(doc.processStatus);

  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 transition-colors hover:border-brand-200">
      {canManage ? (
        <input
          type="checkbox"
          className="size-4 shrink-0 cursor-pointer accent-brand-600"
          checked={selected}
          onChange={onToggleSelect}
          aria-label="选择文档"
        />
      ) : null}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
        <p className="text-xs text-ink-muted mt-0.5 tabular-nums">
          {doc.sourceType} · {formatBytes(doc.fileSize)} · {doc.uploaderName}
        </p>
        {/* 已返回但此前未展示的字段：分块数 + 创建/更新时间（M5） */}
        <p className="text-xs text-ink-subtle mt-0.5 tabular-nums">
          {doc.processStatus === "completed" ? (
            <>父块 {doc.parentChunkCount} · 子块 {doc.childChunkCount} · </>
          ) : null}
          上传 {formatDate(doc.createdAt)}
          {doc.updatedAt !== doc.createdAt ? <> · 更新 {formatDate(doc.updatedAt)}</> : null}
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
            <div className="h-1.5 flex-1 rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-300"
                style={{ width: `${String(percent)}%` }}
              />
            </div>
            <span className="text-xs text-ink-subtle shrink-0 tabular-nums">{percent}%</span>
          </div>
        ) : null}
        {doc.processStatus === "failed" ? (
          <p className="text-xs text-danger mt-1">{message}</p>
        ) : null}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge tone={tone}>{statusLabels[doc.processStatus] ?? doc.processStatus}</Badge>
        <Button variant="outline" size="sm" onClick={onPreview}>
          预览
        </Button>
        {canManage && doc.processStatus === "failed" ? (
          <Button variant="secondary" size="sm" onClick={onReprocess}>
            重试
          </Button>
        ) : null}
        {canManage && !archivedMode ? (
          <Button
            variant="outline"
            size="sm"
            loading={isExtracting}
            disabled={doc.processStatus !== "completed"}
            title={doc.processStatus !== "completed" ? "仅对已解析完成的文档可提炼" : ""}
            onClick={() => onExtract(doc.id)}
          >
            AI 提炼条目
          </Button>
        ) : null}
        {canManage && !archivedMode ? (
          <Button variant="ghost" size="sm" onClick={onArchive}>
            归档
          </Button>
        ) : null}
        {canManage && archivedMode ? (
          <>
            <Button variant="outline" size="sm" onClick={onRestore}>
              恢复
            </Button>
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger hover:bg-danger-bg" onClick={onHardDelete}>
              彻底删除
            </Button>
          </>
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

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
