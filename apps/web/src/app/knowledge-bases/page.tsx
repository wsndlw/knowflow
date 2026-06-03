"use client";

import {
  createKnowledgeBaseRequestSchema,
  departmentOptionsResponseSchema,
  knowledgeBaseSchema,
  knowledgeBaseListResponseSchema,
  type CreateKnowledgeBaseRequest,
  type DepartmentOption,
  type KnowledgeBaseIndexStatus,
  type KnowledgeBaseListItem,
  type KnowledgeBaseVisibility,
} from "@knowflow/shared";
import Link from "next/link";
import { useCallback, useEffect, useState, type SyntheticEvent } from "react";

import { useAuth } from "../../components/auth-provider";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, Skeleton } from "../../components/ui/feedback";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { apiRequest } from "../../lib/api";
import { cn } from "../../lib/cn";

type Filters = {
  visibility: "" | KnowledgeBaseVisibility;
  keyword: string;
};

type ViewMode = "card" | "table";

const visibilityMeta: Record<KnowledgeBaseVisibility, { label: string; tone: "info" | "neutral" | "warning" }> = {
  public: { label: "公开", tone: "info" },
  department: { label: "部门", tone: "neutral" },
  restricted: { label: "受限", tone: "warning" },
};

const indexStatusMeta: Record<
  KnowledgeBaseIndexStatus,
  { label: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }
> = {
  not_indexed: { label: "未构建", tone: "neutral" },
  indexing: { label: "构建中", tone: "info" },
  ready: { label: "可用", tone: "success" },
  partial_failed: { label: "部分失败", tone: "warning" },
  failed: { label: "失败", tone: "danger" },
};

function buildListPath(filters: Filters): string {
  const params = new URLSearchParams();
  if (filters.visibility !== "") {
    params.set("visibility", filters.visibility);
  }
  if (filters.keyword.trim() !== "") {
    params.set("keyword", filters.keyword.trim());
  }
  const query = params.toString();
  return query === "" ? "/knowledge-bases" : `/knowledge-bases?${query}`;
}

export default function KnowledgeBasesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<KnowledgeBaseListItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [filters, setFilters] = useState<Filters>({ visibility: "", keyword: "" });
  const [view, setView] = useState<ViewMode>("card");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const canCreate =
    user?.platformRole === "super_admin" || user?.platformRole === "department_admin";

  const loadKnowledgeBases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await apiRequest(buildListPath(filters), knowledgeBaseListResponseSchema, {
        cache: "no-store",
      });
      setItems(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载知识库失败");
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void loadKnowledgeBases();
  }, [loadKnowledgeBases]);

  useEffect(() => {
    if (!canCreate) {
      return;
    }
    async function loadDepartments() {
      try {
        const response = await apiRequest(
          "/knowledge-bases/departments/options",
          departmentOptionsResponseSchema,
          { cache: "no-store" },
        );
        setDepartments(response.items);
        setSelectedDepartmentId((current) =>
          current === "" ? (response.items[0]?.id ?? "") : current,
        );
      } catch {
        // 部门加载失败不阻塞列表;创建时再提示
      }
    }
    void loadDepartments();
  }, [canCreate]);

  async function handleCreate(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsCreating(true);
    setCreateError(null);
    try {
      const formData = new FormData(form);
      const input: CreateKnowledgeBaseRequest = createKnowledgeBaseRequestSchema.parse({
        name: formData.get("name"),
        description: formData.get("description"),
        departmentId: selectedDepartmentId,
        visibility: formData.get("visibility"),
      });
      await apiRequest("/knowledge-bases", knowledgeBaseSchema, {
        method: "POST",
        body: JSON.stringify(input),
      });
      form.reset();
      setDialogOpen(false);
      await loadKnowledgeBases();
    } catch (caught) {
      setCreateError(caught instanceof Error ? caught.message : "创建知识库失败");
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-8 py-7">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">知识库</h1>
          <p className="mt-1 text-base text-ink-muted">
            管理企业知识资产，按权限浏览与维护。
          </p>
        </div>
        {canCreate ? (
          <Button onClick={() => setDialogOpen(true)}>+ 新建知识库</Button>
        ) : null}
      </header>

      {/* 工具栏:筛选 + 搜索 + 视图切换 */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="w-36">
          <Select
            aria-label="按可见范围筛选"
            value={filters.visibility}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                visibility: event.target.value as Filters["visibility"],
              }))
            }
          >
            <option value="">全部可见范围</option>
            <option value="public">公开</option>
            <option value="department">部门</option>
            <option value="restricted">受限</option>
          </Select>
        </div>
        <div className="min-w-48 flex-1 sm:max-w-xs">
          <Input
            aria-label="搜索知识库"
            placeholder="搜索知识库名称…"
            value={filters.keyword}
            onChange={(event) =>
              setFilters((current) => ({ ...current, keyword: event.target.value }))
            }
          />
        </div>
        <div className="ml-auto flex items-center gap-1 rounded-md border border-border bg-surface p-0.5">
          <ViewToggle active={view === "card"} onClick={() => setView("card")} label="卡片">
            <CardsIcon />
          </ViewToggle>
          <ViewToggle active={view === "table"} onClick={() => setView("table")} label="表格">
            <TableIcon />
          </ViewToggle>
        </div>
      </div>

      {error !== null ? (
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      ) : null}

      {!isLoading && error === null && items.length === 0 ? (
        <EmptyState
          title="暂无知识库"
          description={
            canCreate
              ? "还没有符合条件的知识库,点击右上角新建一个。"
              : "你当前没有可访问的知识库,或没有匹配筛选条件的结果。"
          }
          action={canCreate ? <Button onClick={() => setDialogOpen(true)}>+ 新建知识库</Button> : undefined}
        />
      ) : null}

      {!isLoading && error === null && items.length > 0 ? (
        view === "card" ? (
          <CardView items={items} />
        ) : (
          <TableView items={items} />
        )
      ) : null}

      {/* 创建知识库 Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="新建知识库"
        description="创建后你将成为该知识库的管理员。"
      >
        <form id="create-kb-form" onSubmit={(event) => void handleCreate(event)} className="flex flex-col gap-4">
          <Field label="名称">
            <Input name="name" required maxLength={160} placeholder="如:公司制度知识库" />
          </Field>
          <Field label="归属部门">
            <Select
              name="departmentId"
              required
              value={selectedDepartmentId}
              onChange={(event) => setSelectedDepartmentId(event.target.value)}
            >
              {departments.length === 0 ? <option value="">加载中…</option> : null}
              {departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="可见范围">
            <Select name="visibility" defaultValue="department">
              <option value="public">公开 — 全员可见</option>
              <option value="department">部门 — 归属部门成员可见</option>
              <option value="restricted">受限 — 仅指定成员可见</option>
            </Select>
          </Field>
          <Field label="描述">
            <textarea
              name="description"
              maxLength={2000}
              rows={3}
              placeholder="简要说明这个知识库的内容与用途"
              className="w-full resize-y rounded-md border border-border bg-neutral-0 px-3 py-2 text-base text-ink placeholder:text-ink-subtle hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </Field>
          {createError !== null ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger" role="alert">
              {createError}
            </p>
          ) : null}
          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={isCreating} disabled={departments.length === 0}>
              {isCreating ? "创建中…" : "创建知识库"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
    </label>
  );
}

function CardView({ items }: { items: KnowledgeBaseListItem[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <Link key={item.id} href={`/knowledge-bases/${item.id}`} className="group">
          <Card className="h-full p-5 transition-shadow duration-150 hover:shadow-md">
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-md font-semibold text-ink group-hover:text-brand-700">
                {item.name}
              </h3>
              <Badge tone={visibilityMeta[item.visibility].tone}>
                {visibilityMeta[item.visibility].label}
              </Badge>
            </div>
            <p className="line-clamp-2 min-h-10 text-sm text-ink-muted">
              {item.description ?? "暂无描述"}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <CountStat label="文档" value={item.documentCount} />
              <CountStat label="条目" value={item.knowledgeItemCount} />
              <CountStat label="成员" value={item.memberCount} />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Badge tone={indexStatusMeta[item.indexStatus].tone}>
                {indexStatusMeta[item.indexStatus].label}
              </Badge>
              <span className="text-xs text-ink-subtle">{item.departmentName}</span>
              {item.canManage ? (
                <span className="ml-auto text-xs font-medium text-brand-600">管理员</span>
              ) : null}
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

function CountStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-50 px-2 py-1.5">
      <div className="text-sm font-semibold text-ink">{value}</div>
      <div className="text-xs text-ink-subtle">{label}</div>
    </div>
  );
}

function TableView({ items }: { items: KnowledgeBaseListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-left text-base">
        <thead>
          <tr className="border-b border-border bg-neutral-50 text-sm text-ink-muted">
            <th className="px-4 py-2.5 font-medium">名称</th>
            <th className="px-4 py-2.5 font-medium">可见范围</th>
            <th className="px-4 py-2.5 font-medium">索引状态</th>
            <th className="px-4 py-2.5 font-medium">文档</th>
            <th className="px-4 py-2.5 font-medium">条目</th>
            <th className="px-4 py-2.5 font-medium">成员</th>
            <th className="px-4 py-2.5 font-medium">部门</th>
            <th className="px-4 py-2.5 font-medium">角色</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-border last:border-0 hover:bg-neutral-50">
              <td className="px-4 py-3">
                <Link href={`/knowledge-bases/${item.id}`} className="font-medium text-ink hover:text-brand-700">
                  {item.name}
                </Link>
                {item.description !== null ? (
                  <p className="mt-0.5 line-clamp-1 text-sm text-ink-subtle">{item.description}</p>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <Badge tone={visibilityMeta[item.visibility].tone}>
                  {visibilityMeta[item.visibility].label}
                </Badge>
              </td>
              <td className="px-4 py-3">
                <Badge tone={indexStatusMeta[item.indexStatus].tone}>
                  {indexStatusMeta[item.indexStatus].label}
                </Badge>
              </td>
              <td className="px-4 py-3 text-ink-muted">{item.documentCount}</td>
              <td className="px-4 py-3 text-ink-muted">{item.knowledgeItemCount}</td>
              <td className="px-4 py-3 text-ink-muted">{item.memberCount}</td>
              <td className="px-4 py-3 text-ink-muted">{item.departmentName}</td>
              <td className="px-4 py-3 text-ink-muted">{item.canManage ? "管理员" : "成员"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ViewToggle({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-7 place-items-center rounded transition-colors duration-150",
        active ? "bg-brand-50 text-brand-700" : "text-ink-subtle hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function CardsIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="1.5" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1" fill="currentColor" />
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.5 6.5h13M6 6.5v7" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
