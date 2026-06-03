"use client";

import { useEffect, useState } from "react";
import {
  type KnowledgeDocument,
  documentContentResponseSchema,
  documentChunksResponseSchema,
  type DocumentChunkItem,
} from "@knowflow/shared";

import { Dialog } from "../../../../components/ui/dialog";
import { Button } from "../../../../components/ui/button";
import { Skeleton, EmptyState } from "../../../../components/ui/feedback";
import { Badge } from "../../../../components/ui/badge";
import { Select } from "../../../../components/ui/select";
import { Pagination } from "./pagination";
import { apiRequest, apiUrl } from "../../../../lib/api";

type DocumentPreviewDialogProps = {
  doc: KnowledgeDocument | null;
  onClose: () => void;
};

export function DocumentPreviewDialog({ doc, onClose }: DocumentPreviewDialogProps) {
  const [activeTab, setActiveTab] = useState<"text" | "chunks" | "file">("text");

  // If doc changes, reset tab to text
  useEffect(() => {
    if (doc) {
      setActiveTab("text");
    }
  }, [doc]);

  if (!doc) return null;

  return (
    <Dialog
      open={Boolean(doc)}
      onClose={onClose}
      title="文档预览"
      description={doc.title}
    >
      <div className="flex flex-col gap-4 mt-2 h-[70vh] min-h-[500px]">
        {/* 自定义 Tab 导航 */}
        <div className="flex items-center gap-2 border-b border-border pb-2">
          <Button
            variant={activeTab === "text" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("text")}
          >
            原文
          </Button>
          <Button
            variant={activeTab === "chunks" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("chunks")}
          >
            分块
          </Button>
          <Button
            variant={activeTab === "file" ? "default" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("file")}
          >
            原始文件
          </Button>
        </div>

        {/* Tab 内容区 */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {activeTab === "text" ? <TextView doc={doc} /> : null}
          {activeTab === "chunks" ? <ChunksView doc={doc} /> : null}
          {activeTab === "file" ? <FileView doc={doc} /> : null}
        </div>
      </div>
    </Dialog>
  );
}

function TextView({ doc }: { doc: KnowledgeDocument }) {
  const [data, setData] = useState<{ text: string; truncated: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      if (doc.parseStatus !== "completed" && doc.parseStatus !== "chunking" && doc.parseStatus !== "embedding") {
        setError("文档尚未完成解析，无法预览原文");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest(
          `/documents/${doc.id}/content`,
          documentContentResponseSchema,
        );
        setData({ text: res.text, truncated: res.truncated });
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          setError("暂无权限或内容不存在");
        } else {
          setError(err instanceof Error ? err.message : "加载原文失败");
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [doc]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-6 w-full" />
        <Skeleton className="h-6 w-5/6" />
        <Skeleton className="h-6 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-danger bg-danger-bg p-3 rounded-md text-sm">{error}</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto bg-neutral-50 rounded-md p-4 flex flex-col gap-4">
      {data?.truncated ? (
        <div className="bg-warning-bg text-warning p-2 rounded-md text-xs">
          文档过长，仅展示前部分内容。
        </div>
      ) : null}
      <pre className="whitespace-pre-wrap text-sm text-ink font-sans break-words">
        {data?.text ?? "暂无内容"}
      </pre>
    </div>
  );
}

function ChunksView({ doc }: { doc: KnowledgeDocument }) {
  const [items, setItems] = useState<DocumentChunkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [level, setLevel] = useState<"parent" | "child">("parent");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const pageSize = 10;

  useEffect(() => {
    async function load() {
      if (doc.processStatus !== "completed" && doc.processStatus !== "embedding") {
        setError("文档尚未完成切分，无法预览分块");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest(
          `/documents/${doc.id}/chunks?level=${level}&page=${String(page)}&pageSize=${String(pageSize)}`,
          documentChunksResponseSchema,
        );
        setItems(res.items);
        setTotal(res.total);
      } catch (err) {
        if (err instanceof Error && err.message.includes("404")) {
          setError("暂无权限或内容不存在");
        } else {
          setError(err instanceof Error ? err.message : "加载分块失败");
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [doc, level, page]);

  if (loading && items.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="text-danger bg-danger-bg p-3 rounded-md text-sm">{error}</p>;
  }

  return (
    <div className="flex-1 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex justify-between items-center shrink-0">
        <Select
          value={level}
          onChange={(e) => { setLevel(e.target.value as "parent" | "child"); setPage(1); }}
          className="w-40"
        >
          <option value="parent">父块 (Parent)</option>
          <option value="child">子块 (Child)</option>
        </Select>
        <span className="text-xs text-ink-subtle">共 {total} 块</span>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-2">
        {items.length === 0 ? (
          <EmptyState title="暂无分块" description="该层级暂无分块数据" />
        ) : (
          items.map((chunk) => (
            <div key={chunk.id} className="p-3 border border-border rounded-md bg-surface flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <Badge tone="neutral"># {chunk.seq}</Badge>
                {chunk.tokenCount ? <span className="text-xs text-ink-subtle">{chunk.tokenCount} tokens</span> : null}
              </div>
              <p className="text-sm text-ink line-clamp-4 hover:line-clamp-none transition-all">{chunk.content}</p>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 pt-2 border-t border-border">
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}

function FileView({ doc }: { doc: KnowledgeDocument }) {
  if (!doc.fileId) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-50 rounded-md">
        <EmptyState title="无原始文件" description="该文档没有关联的原始文件，可能通过纯文本或其他方式导入。" />
      </div>
    );
  }

  const isImage = (doc.fileType?.startsWith("image/") ?? false) || [".png", ".jpg", ".jpeg", ".webp"].some(ext => doc.title.toLowerCase().endsWith(ext));
  const isPdf = doc.fileType === "application/pdf" || doc.title.toLowerCase().endsWith(".pdf");

  const url = apiUrl(`/documents/${doc.id}/file?disposition=inline`);
  const downloadUrl = apiUrl(`/documents/${doc.id}/file?disposition=attachment`);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-2 shrink-0">
        <span className="text-sm text-ink-muted">支持内联预览：PDF / 图片</span>
        <Button variant="outline" size="sm" onClick={() => window.open(downloadUrl, "_blank")}>
          下载原文件
        </Button>
      </div>
      <div className="flex-1 border border-border rounded-md overflow-hidden bg-neutral-100 flex items-center justify-center">
        {isImage ? (
          <img src={url} alt={doc.title} className="max-w-full max-h-full object-contain" />
        ) : isPdf ? (
          <iframe src={url} className="w-full h-full" title={doc.title} />
        ) : (
          <div className="text-center flex flex-col items-center gap-2">
            <p className="text-ink text-sm">该文件类型不支持在浏览器中直接预览</p>
            <Button variant="default" onClick={() => window.open(downloadUrl, "_blank")}>
              下载文件
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
