"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AuditTargetType,
  knowledgeBaseMembersResponseSchema,
  type KnowledgeBaseMember,
} from "@knowflow/shared";

import { EmptyState, Skeleton } from "@/components/ui/feedback";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { apiRequest } from "@/lib/api";

import { AuditLogFiltersBar } from "./audit-log-filters";
import { AuditLogTable } from "./audit-log-table";
import { useAuditLogs } from "../_hooks/use-audit-logs";
import { type TabValue } from "../_hooks/use-tab-state";

type TabAuditLogsProps = {
  knowledgeBaseId: string;
  /** 跳转到文档/知识条目 tab */
  onJumpTab: (tab: TabValue) => void;
};

/** 生成分页页码（含省略）。 */
function buildPages(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) pages.push("ellipsis");
  for (let p = start; p <= end; p += 1) pages.push(p);
  if (end < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function TabAuditLogs({ knowledgeBaseId, onJumpTab }: TabAuditLogsProps) {
  const { items, total, page, totalPages, loading, error, filters, setFilters, setPage } =
    useAuditLogs(knowledgeBaseId);
  const [members, setMembers] = useState<KnowledgeBaseMember[]>([]);

  useEffect(() => {
    const subscription = { active: true };
    void (async () => {
      try {
        const data = await apiRequest(
          `/knowledge-bases/${knowledgeBaseId}/members`,
          knowledgeBaseMembersResponseSchema,
          { cache: "no-store" },
        );
        if (subscription.active) setMembers(data.items);
      } catch {
        // 成员列表加载失败不阻塞日志展示，操作者筛选退化为仅"全部"
        if (subscription.active) setMembers([]);
      }
    })();
    return () => {
      subscription.active = false;
    };
  }, [knowledgeBaseId]);

  const handleJumpTarget = useCallback(
    (targetType: AuditTargetType) => {
      if (targetType === AuditTargetType.DOCUMENT) onJumpTab("documents");
      else if (targetType === AuditTargetType.KNOWLEDGE_ITEM) onJumpTab("knowledge-items");
    },
    [onJumpTab],
  );

  const hasActiveFilter =
    filters.actions.length > 0 ||
    filters.userId !== "" ||
    filters.result !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  return (
    <div className="flex flex-col gap-4">
      <AuditLogFiltersBar filters={filters} onChange={setFilters} members={members} />

      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={hasActiveFilter ? "没有符合条件的日志" : "暂无操作日志"}
          description={
            hasActiveFilter
              ? "试着调整筛选条件，或清空筛选查看全部记录。"
              : "知识库的上传、删除、发布等操作会记录在这里。"
          }
        />
      ) : (
        <>
          <AuditLogTable items={items} onJumpTarget={handleJumpTarget} />

          <div className="flex items-center justify-between">
            <p className="text-xs text-ink-subtle tabular-nums">共 {total} 条记录</p>
            {totalPages > 1 ? (
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationLink
                      size="default"
                      onClick={() => page > 1 && setPage(page - 1)}
                      aria-disabled={page <= 1}
                      className={page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                    >
                      上一页
                    </PaginationLink>
                  </PaginationItem>
                  {buildPages(page, totalPages).map((p, idx) =>
                    p === "ellipsis" ? (
                      <PaginationItem key={`ellipsis-${String(idx)}`}>
                        <span className="px-2 text-ink-subtle">…</span>
                      </PaginationItem>
                    ) : (
                      <PaginationItem key={p}>
                        <PaginationLink
                          isActive={p === page}
                          onClick={() => setPage(p)}
                          className="cursor-pointer"
                        >
                          {p}
                        </PaginationLink>
                      </PaginationItem>
                    ),
                  )}
                  <PaginationItem>
                    <PaginationLink
                      size="default"
                      onClick={() => page < totalPages && setPage(page + 1)}
                      aria-disabled={page >= totalPages}
                      className={
                        page >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                      }
                    >
                      下一页
                    </PaginationLink>
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
