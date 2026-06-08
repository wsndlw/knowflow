"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "lucide-react";
import type { RetrievalTestMode } from "@knowflow/shared";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/cn";

import {
  type AdvancedConfig,
  type RetrievalWeights,
  RETRIEVAL_MODE_HINTS,
  RETRIEVAL_MODE_LABELS,
  RETRIEVAL_MODE_ORDER,
  clamp01,
  disabledParamGroups,
  formatWeight,
  hasInvalidRerankRange,
  rebalanceWeights,
} from "./helpers";

export type RetrievalFilters = {
  documentStatus: string;
  itemStatus: string;
  sourceType: string;
};

type ConfigPanelProps = {
  mode: RetrievalTestMode;
  onModeChange: (mode: RetrievalTestMode) => void;
  filters: RetrievalFilters;
  onFiltersChange: (filters: RetrievalFilters) => void;
  advanced: AdvancedConfig;
  onAdvancedChange: (advanced: AdvancedConfig) => void;
};

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (Number.isNaN(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function ConfigPanel({
  mode,
  onModeChange,
  filters,
  onFiltersChange,
  advanced,
  onAdvancedChange,
}: ConfigPanelProps) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const disabled = disabledParamGroups(mode);

  function patch(next: Partial<AdvancedConfig>) {
    onAdvancedChange({ ...advanced, ...next });
  }

  function handleWeightChange(key: keyof RetrievalWeights, value: number) {
    const weights: RetrievalWeights = {
      vectorWeight: advanced.vectorWeight,
      ftsWeight: advanced.ftsWeight,
      kiWeight: advanced.kiWeight,
    };
    patch(rebalanceWeights(weights, key, value));
  }

  const weightRows: { key: keyof RetrievalWeights; label: string }[] = [
    { key: "vectorWeight", label: "向量权重" },
    { key: "ftsWeight", label: "全文权重" },
    { key: "kiWeight", label: "知识条目权重" },
  ];

  return (
    <aside className="flex flex-col gap-5 rounded-lg border border-border bg-surface p-4">
      {/* 检索模式 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">检索模式</h3>
        <RadioGroup
          value={mode}
          onValueChange={(value) => onModeChange(value as RetrievalTestMode)}
          aria-label="检索模式"
        >
          {RETRIEVAL_MODE_ORDER.map((value) => (
            <label
              key={value}
              htmlFor={`retrieval-mode-${value}`}
              className="flex cursor-pointer items-start gap-2.5"
            >
              <RadioGroupItem id={`retrieval-mode-${value}`} value={value} className="mt-0.5" />
              <span className="flex flex-col">
                <span className="text-sm text-ink">{RETRIEVAL_MODE_LABELS[value]}</span>
                <span className="text-xs text-ink-subtle">{RETRIEVAL_MODE_HINTS[value]}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </section>

      <Separator />

      {/* 过滤条件 */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">过滤条件</h3>
        <FilterField label="文档状态">
          <Select
            value={filters.documentStatus}
            onValueChange={(next) => onFiltersChange({ ...filters, documentStatus: next })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="文档状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="completed">仅处理完成</SelectItem>
              <SelectItem value="all">全部文档</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="条目状态">
          <Select
            value={filters.itemStatus}
            onValueChange={(next) => onFiltersChange({ ...filters, itemStatus: next })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="条目状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="published">仅已发布</SelectItem>
              <SelectItem value="all">全部条目</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="来源类型">
          <Select
            value={filters.sourceType}
            onValueChange={(next) => onFiltersChange({ ...filters, sourceType: next })}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="来源类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="chunk">仅文档切片</SelectItem>
              <SelectItem value="knowledge_item">仅知识条目</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </section>

      <Separator />

      {/* 高级参数 */}
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-semibold text-ink">
          <span>高级参数</span>
          <ChevronDownIcon
            className={cn("size-4 text-ink-subtle transition-transform", advancedOpen && "rotate-180")}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-4 pt-4">
          {mode === "default" ? (
            <p className="rounded-md bg-info-bg px-3 py-2 text-xs text-info">
              默认模式下使用知识库已保存的检索设置，如需调参请切换到其他模式。
            </p>
          ) : null}

          {/* topK */}
          <ParamRow label="召回数量 topK" htmlFor="param-topk">
            <Input
              id="param-topk"
              type="number"
              min={1}
              max={50}
              value={advanced.topK}
              disabled={disabled.has("topK")}
              onChange={(event) =>
                patch({ topK: clampInt(Number.parseInt(event.target.value, 10), 1, 50, advanced.topK) })
              }
              className="h-8 w-24"
            />
          </ParamRow>

          {/* 相似度阈值 */}
          <div className={cn("flex flex-col gap-2", disabled.has("threshold") && "opacity-50")}>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-ink">相似度阈值</Label>
              <span className="text-xs tabular-nums text-ink-muted">
                {advanced.similarityThreshold.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[advanced.similarityThreshold]}
              min={0}
              max={1}
              step={0.01}
              disabled={disabled.has("threshold")}
              onValueChange={(values) =>
                patch({ similarityThreshold: clamp01(values[0] ?? advanced.similarityThreshold) })
              }
              aria-label="相似度阈值"
            />
          </div>

          {/* Rerank */}
          <div className={cn("flex flex-col gap-3", disabled.has("rerank") && "opacity-50")}>
            <div className="flex items-center justify-between">
              <Label htmlFor="param-rerank" className="text-sm font-normal text-ink">
                启用 Rerank
              </Label>
              <Switch
                id="param-rerank"
                checked={advanced.rerankEnabled}
                disabled={disabled.has("rerank")}
                onCheckedChange={(checked) => patch({ rerankEnabled: checked })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ParamRow label="Rerank topN" htmlFor="param-rerank-topn" stacked>
                <Input
                  id="param-rerank-topn"
                  type="number"
                  min={1}
                  max={100}
                  value={advanced.rerankTopN}
                  disabled={disabled.has("rerank") || !advanced.rerankEnabled}
                  onChange={(event) =>
                    patch({
                      rerankTopN: clampInt(Number.parseInt(event.target.value, 10), 1, 100, advanced.rerankTopN),
                    })
                  }
                  className="h-8"
                />
              </ParamRow>
              <ParamRow label="Rerank keepN" htmlFor="param-rerank-keepn" stacked>
                <Input
                  id="param-rerank-keepn"
                  type="number"
                  min={1}
                  max={50}
                  value={advanced.rerankKeepN}
                  disabled={disabled.has("rerank") || !advanced.rerankEnabled}
                  onChange={(event) =>
                    patch({
                      rerankKeepN: clampInt(Number.parseInt(event.target.value, 10), 1, 50, advanced.rerankKeepN),
                    })
                  }
                  className="h-8"
                />
              </ParamRow>
            </div>
            {hasInvalidRerankRange(mode, advanced) ? (
              <p className="text-xs text-danger">Rerank keepN 不能大于 topN</p>
            ) : null}
          </div>

          {/* 权重 */}
          <div className={cn("flex flex-col gap-3", disabled.has("weights") && "opacity-50")}>
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal text-ink">通道权重</Label>
              <span className="text-xs text-ink-subtle">总和恒为 1</span>
            </div>
            {weightRows.map((row) => (
              <div key={row.key} className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink-muted">{row.label}</span>
                  <span className="text-xs tabular-nums text-ink-muted">
                    {formatWeight(advanced[row.key])}
                  </span>
                </div>
                <Slider
                  value={[advanced[row.key]]}
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={disabled.has("weights")}
                  onValueChange={(values) => handleWeightChange(row.key, values[0] ?? advanced[row.key])}
                  aria-label={row.label}
                />
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </aside>
  );
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink-muted">{label}</span>
      <div className="w-40">{children}</div>
    </label>
  );
}

function ParamRow({
  label,
  htmlFor,
  stacked = false,
  children,
}: {
  label: string;
  htmlFor: string;
  stacked?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={cn(stacked ? "flex flex-col gap-1.5" : "flex items-center justify-between gap-3")}>
      <Label htmlFor={htmlFor} className="text-sm font-normal text-ink-muted">
        {label}
      </Label>
      {children}
    </div>
  );
}
