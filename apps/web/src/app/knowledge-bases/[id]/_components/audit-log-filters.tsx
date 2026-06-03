"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, ChevronDownIcon, XIcon } from "lucide-react";
import { ACTION_LABELS, type AuditResult, type KnowledgeBaseMember } from "@knowflow/shared";
import { type DateRange } from "react-day-picker";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/cn";

import {
  EMPTY_AUDIT_FILTERS,
  type AuditLogFilters,
  type AuditTimePreset,
} from "../_hooks/use-audit-logs";

type AuditLogFiltersBarProps = {
  filters: AuditLogFilters;
  onChange: (next: AuditLogFilters) => void;
  members: KnowledgeBaseMember[];
};

// 操作类型选项：取自 shared 的 ACTION_LABELS（action → 中文）
const ACTION_OPTIONS: { value: string; label: string }[] = Object.entries(ACTION_LABELS).map(
  ([value, label]) => ({ value, label }),
);

const RESULT_OPTIONS: { value: AuditResult; label: string }[] = [
  { value: "success", label: "成功" },
  { value: "failure", label: "失败" },
];

const ALL_VALUE = "__all__";

function isoStartOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function isoEndOfDay(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.toISOString();
}

function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function AuditLogFiltersBar({ filters, onChange, members }: AuditLogFiltersBarProps) {
  const [actionOpen, setActionOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const selectedActionLabels = useMemo(
    () => filters.actions.map((a) => ACTION_LABELS[a] ?? a),
    [filters.actions],
  );

  // 显示态直接读 filters.timePreset，不再用绝对日期反推（避免跨天高亮漂移）
  const activePreset = filters.timePreset;

  const customRange: DateRange | undefined = useMemo(() => {
    if (activePreset !== "custom") return undefined;
    return {
      from: filters.from ? new Date(filters.from) : undefined,
      to: filters.to ? new Date(filters.to) : undefined,
    };
  }, [activePreset, filters.from, filters.to]);

  function toggleAction(value: string) {
    const next = filters.actions.includes(value)
      ? filters.actions.filter((a) => a !== value)
      : [...filters.actions, value];
    onChange({ ...filters, actions: next });
  }

  function applyPreset(preset: AuditTimePreset) {
    if (preset === "7d") {
      onChange({ ...filters, from: daysAgoIso(7), to: "", timePreset: "7d" });
    } else if (preset === "30d") {
      onChange({ ...filters, from: daysAgoIso(30), to: "", timePreset: "30d" });
    } else if (preset === "all") {
      onChange({ ...filters, from: "", to: "", timePreset: "all" });
    }
  }

  function applyCustomRange(range: DateRange | undefined) {
    onChange({
      ...filters,
      from: range?.from ? isoStartOfDay(range.from) : "",
      to: range?.to ? isoEndOfDay(range.to) : "",
      timePreset: "custom",
    });
  }

  const timeLabel = useMemo(() => {
    if (activePreset === "7d") return "最近 7 天";
    if (activePreset === "30d") return "最近 30 天";
    if (activePreset === "all") return "全部时间";
    const fromText = filters.from ? new Date(filters.from).toLocaleDateString("zh-CN") : "…";
    const toText = filters.to ? new Date(filters.to).toLocaleDateString("zh-CN") : "…";
    return `${fromText} ~ ${toText}`;
  }, [activePreset, filters.from, filters.to]);

  const hasActiveFilter =
    filters.actions.length > 0 || filters.userId !== "" || filters.result !== "" || filters.from !== "" || filters.to !== "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 操作类型：多选 */}
      <Popover open={actionOpen} onOpenChange={setActionOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            操作类型
            {filters.actions.length > 0 ? (
              <Badge tone="brand" className="ml-1">
                {filters.actions.length}
              </Badge>
            ) : null}
            <ChevronDownIcon className="size-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          <Command>
            <CommandInput placeholder="搜索操作类型…" />
            <CommandList>
              <CommandEmpty>无匹配操作类型</CommandEmpty>
              <CommandGroup>
                {ACTION_OPTIONS.map((opt) => {
                  const checked = filters.actions.includes(opt.value);
                  return (
                    <CommandItem
                      key={opt.value}
                      value={`${opt.label} ${opt.value}`}
                      onSelect={() => toggleAction(opt.value)}
                      className="gap-2"
                    >
                      <Checkbox checked={checked} aria-hidden tabIndex={-1} className="pointer-events-none" />
                      <span className="flex-1">{opt.label}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* 操作者：单选(KB 成员) */}
      <Select
        value={filters.userId === "" ? ALL_VALUE : filters.userId}
        onValueChange={(v) => onChange({ ...filters, userId: v === ALL_VALUE ? "" : v })}
      >
        <SelectTrigger size="sm" className="w-[160px]">
          <SelectValue placeholder="操作者" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>全部操作者</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 时间范围：预设 + 自定义 */}
      <Popover open={timeOpen} onOpenChange={setTimeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5">
            <CalendarIcon className="size-4 opacity-60" />
            {timeLabel}
            <ChevronDownIcon className="size-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3" align="start">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <PresetButton active={activePreset === "7d"} onClick={() => applyPreset("7d")}>
              最近 7 天
            </PresetButton>
            <PresetButton active={activePreset === "30d"} onClick={() => applyPreset("30d")}>
              最近 30 天
            </PresetButton>
            <PresetButton active={activePreset === "all"} onClick={() => applyPreset("all")}>
              全部
            </PresetButton>
          </div>
          <Calendar
            mode="range"
            numberOfMonths={1}
            selected={customRange}
            onSelect={applyCustomRange}
            autoFocus
          />
        </PopoverContent>
      </Popover>

      {/* 结果：单选 */}
      <Select
        value={filters.result === "" ? ALL_VALUE : filters.result}
        onValueChange={(v) =>
          onChange({ ...filters, result: v === ALL_VALUE ? "" : (v as AuditResult) })
        }
      >
        <SelectTrigger size="sm" className="w-[120px]">
          <SelectValue placeholder="结果" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>全部结果</SelectItem>
          {RESULT_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 已选操作类型 chips + 清空 */}
      {selectedActionLabels.length > 0
        ? selectedActionLabels.map((label, idx) => (
            <Badge
              key={filters.actions[idx]}
              tone="neutral"
              className="gap-1"
            >
              {label}
              <button
                type="button"
                aria-label={`移除 ${label}`}
                onClick={() => toggleAction(filters.actions[idx] ?? "")}
                className="rounded-full hover:text-danger"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))
        : null}

      {hasActiveFilter ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_AUDIT_FILTERS)}
          className="text-ink-muted"
        >
          清空筛选
        </Button>
      ) : null}
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-accent text-accent-foreground"
          : "border-border text-ink-muted hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
