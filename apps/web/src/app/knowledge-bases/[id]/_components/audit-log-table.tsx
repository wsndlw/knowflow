"use client";

import { useState } from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  ListTreeIcon,
  TagIcon,
  BotIcon,
  DatabaseIcon,
  SettingsIcon,
  NetworkIcon,
  UserIcon,
} from "lucide-react";
import { type AuditLogEntry, type AuditTargetType } from "@knowflow/shared";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/datetime";

type AuditLogTableProps = {
  items: AuditLogEntry[];
  /** 跳转到文档/条目所在 tab */
  onJumpTarget: (targetType: AuditTargetType) => void;
};

const TARGET_ICONS: Record<string, typeof FileTextIcon> = {
  document: FileTextIcon,
  knowledge_item: ListTreeIcon,
  tag: TagIcon,
  agent: BotIcon,
  knowledge_base: DatabaseIcon,
  retrieval_settings: SettingsIcon,
  mind_map: NetworkIcon,
  user: UserIcon,
};

const TARGET_TYPE_LABELS: Record<string, string> = {
  document: "文档",
  knowledge_item: "知识条目",
  tag: "标签",
  agent: "专家 Agent",
  knowledge_base: "知识库",
  retrieval_settings: "检索设置",
  mind_map: "思维导图",
  user: "用户",
};

/** 可跳转到详情的目标类型 */
const JUMPABLE: ReadonlySet<string> = new Set(["document", "knowledge_item"]);

function initial(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function AuditLogTable({ items, onJumpTarget }: AuditLogTableProps) {
  return (
    <TooltipProvider>
      <Table>
        <TableHead>
          <tr>
            <TableHeaderCell className="w-8" />
            <TableHeaderCell>时间</TableHeaderCell>
            <TableHeaderCell>操作者</TableHeaderCell>
            <TableHeaderCell>操作类型</TableHeaderCell>
            <TableHeaderCell>操作对象</TableHeaderCell>
            <TableHeaderCell>结果</TableHeaderCell>
          </tr>
        </TableHead>
        <TableBody>
          {items.map((entry) => (
            <AuditRow key={entry.id} entry={entry} onJumpTarget={onJumpTarget} />
          ))}
        </TableBody>
      </Table>
    </TooltipProvider>
  );
}

function AuditRow({
  entry,
  onJumpTarget,
}: {
  entry: AuditLogEntry;
  onJumpTarget: (targetType: AuditTargetType) => void;
}) {
  const [open, setOpen] = useState(false);
  const TargetIcon = TARGET_ICONS[entry.targetType] ?? DatabaseIcon;
  const canJump = JUMPABLE.has(entry.targetType) && entry.targetId !== null;

  return (
    <>
      <TableRow
        className="cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <TableCell className="text-ink-subtle">
          {open ? <ChevronDownIcon className="size-4" /> : <ChevronRightIcon className="size-4" />}
        </TableCell>
        <TableCell>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-ink-muted">{formatRelativeTime(entry.createdAt)}</span>
            </TooltipTrigger>
            <TooltipContent>{formatAbsoluteTime(entry.createdAt)}</TooltipContent>
          </Tooltip>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-2">
            <Avatar size="sm">
              <AvatarFallback>{initial(entry.userName)}</AvatarFallback>
            </Avatar>
            <span className="font-medium">{entry.userName ?? "未知用户"}</span>
          </div>
        </TableCell>
        <TableCell>
          <Badge tone="neutral">{entry.actionLabel}</Badge>
        </TableCell>
        <TableCell>
          <div className="flex items-center gap-1.5">
            <TargetIcon className="size-4 text-ink-subtle" aria-hidden />
            <span className="text-ink-subtle text-xs">
              {TARGET_TYPE_LABELS[entry.targetType] ?? entry.targetType}
            </span>
            {entry.targetLabel ? (
              canJump ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onJumpTarget(entry.targetType);
                  }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {entry.targetLabel}
                </button>
              ) : (
                <span className="text-ink">{entry.targetLabel}</span>
              )
            ) : (
              <span className="text-ink-subtle">—</span>
            )}
          </div>
        </TableCell>
        <TableCell>
          <Badge tone={entry.result === "success" ? "success" : "danger"}>
            {entry.result === "success" ? "成功" : "失败"}
          </Badge>
        </TableCell>
      </TableRow>
      <DetailRow entry={entry} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DetailRow({
  entry,
  open,
  onOpenChange,
}: {
  entry: AuditLogEntry;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const hasDetail = Object.keys(entry.detail).length > 0;
  return (
    <tr className="border-b">
      <td colSpan={6} className="p-0">
        <Collapsible open={open} onOpenChange={onOpenChange}>
          <CollapsibleContent>
            <div className="grid gap-4 bg-muted/40 px-6 py-4 text-sm md:grid-cols-[1fr_280px]">
              <div className="min-w-0">
                <p className="mb-2 text-xs font-medium text-ink-subtle uppercase tracking-wide">
                  详情
                </p>
                {hasDetail ? (
                  <div className="rounded-md border border-border bg-surface p-3">
                    <JsonTree value={entry.detail} />
                  </div>
                ) : (
                  <p className="text-ink-subtle">无详情数据</p>
                )}
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-ink-subtle uppercase tracking-wide">
                    IP 地址
                  </p>
                  <p className="font-mono text-xs text-ink">{entry.ip ?? "—"}</p>
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-medium text-ink-subtle uppercase tracking-wide">
                    User-Agent
                  </p>
                  {entry.userAgent ? (
                    <p className="font-mono text-xs break-all text-ink-muted">{entry.userAgent}</p>
                  ) : (
                    <p className="text-ink-subtle">—</p>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </td>
    </tr>
  );
}

/** 可递归渲染嵌套对象/数组为缩进 key: value 树（非原始 JSON 代码块）。 */
function JsonTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined) {
    return <span className="text-ink-subtle">null</span>;
  }
  if (typeof value !== "object") {
    const text =
      typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean" || typeof value === "bigint"
          ? String(value)
          : JSON.stringify(value);
    return <span className="text-ink break-all">{text}</span>;
  }

  const entries: [string, unknown][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value as Record<string, unknown>);

  if (entries.length === 0) {
    return <span className="text-ink-subtle">{Array.isArray(value) ? "[]" : "{}"}</span>;
  }

  return (
    <ul className={cn("flex flex-col gap-1", depth > 0 && "mt-1 border-l border-border pl-3")}>
      {entries.map(([key, child]) => {
        const isLeaf = child === null || typeof child !== "object";
        return (
          <li key={key} className={cn(isLeaf && "flex flex-wrap gap-1.5")}>
            <span className="shrink-0 font-medium text-ink-muted">{key}：</span>
            <JsonTree value={child} depth={depth + 1} />
          </li>
        );
      })}
    </ul>
  );
}

