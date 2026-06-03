"use client";

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";

import { CHANNEL_LABELS, type RetrievalResult } from "./helpers";

const KI_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  pending_review: "待审核",
  published: "已发布",
  unpublished: "已下架",
  expired: "已过期",
};

export function ResultDetail({ result }: { result: RetrievalResult }) {
  const { source, knowledgeItem, channels } = result;

  return (
    <div className="flex flex-col gap-4 border-t border-border pt-4 text-sm">
      <Field label="完整文本">
        <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-ink">{result.content}</p>
      </Field>

      {source.parentContent !== null ? (
        <Field
          label={`上级切片上下文${
            source.parentChunkTitle !== null ? ` · ${source.parentChunkTitle}` : ""
          }`}
        >
          <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md bg-neutral-100 p-3 text-ink-muted">
            {source.parentContent}
          </p>
        </Field>
      ) : null}

      <Field label="命中通道">
        <div className="flex flex-wrap gap-1.5">
          {channels.length > 0 ? (
            channels.map((channel) => (
              <Badge key={channel} tone="brand">
                {CHANNEL_LABELS[channel] ?? channel}
              </Badge>
            ))
          ) : (
            <span className="text-xs text-ink-subtle">—</span>
          )}
        </div>
      </Field>

      <Field label="来源信息">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          <Meta label="文档" value={source.documentTitle} />
          <Meta
            label="标题路径"
            value={source.headingPath !== null ? source.headingPath.join(" / ") : null}
          />
          <Meta label="页码" value={formatPageRange(source.pageStart, source.pageEnd)} />
          <Meta
            label="切片序号"
            value={source.chunkIndex !== null ? String(source.chunkIndex) : null}
          />
          <Meta
            label="Token 数"
            value={source.tokenCount !== null ? String(source.tokenCount) : null}
          />
          <Meta
            label="创建时间"
            value={source.createdAt !== null ? formatDateTime(source.createdAt) : null}
          />
        </dl>
      </Field>

      {knowledgeItem !== undefined ? (
        <Field label="知识条目信息">
          <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
            <Meta label="状态" value={KI_STATUS_LABELS[knowledgeItem.status] ?? knowledgeItem.status} />
            <Meta label="浏览 / 引用 / 点赞" value={`${String(knowledgeItem.viewCount)} / ${String(knowledgeItem.citeCount)} / ${String(knowledgeItem.likeCount)}`} />
            <Meta
              label="审核时间"
              value={knowledgeItem.verifiedAt !== null ? formatDateTime(knowledgeItem.verifiedAt) : null}
            />
            {knowledgeItem.summary !== null ? (
              <div className="sm:col-span-2">
                <Meta label="摘要" value={knowledgeItem.summary} />
              </div>
            ) : null}
          </dl>
        </Field>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-ink-subtle">{label}</span>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-xs text-ink-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-xs text-ink-muted">{value ?? "—"}</dd>
    </div>
  );
}

function formatPageRange(start: number | null, end: number | null): string | null {
  if (start === null && end === null) {
    return null;
  }
  if (start !== null && end !== null && start !== end) {
    return `${String(start)} - ${String(end)}`;
  }
  return String(start ?? end);
}

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
