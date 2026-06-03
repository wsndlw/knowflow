import type { RetrievalTestMode, RetrievalTestResponse } from "@knowflow/shared";

export type RetrievalResult = RetrievalTestResponse["results"][number];

// ── 中文标签映射 ──────────────────────────────────────────────

export const RETRIEVAL_MODE_ORDER: RetrievalTestMode[] = [
  "default",
  "vector_only",
  "fts_only",
  "ki_only",
  "hybrid",
  "hybrid_rerank",
];

export const RETRIEVAL_MODE_LABELS: Record<RetrievalTestMode, string> = {
  default: "知识库默认设置",
  vector_only: "仅向量检索",
  fts_only: "仅全文检索",
  ki_only: "仅知识条目检索",
  hybrid: "混合检索",
  hybrid_rerank: "混合检索 + Rerank",
};

export const RETRIEVAL_MODE_HINTS: Record<RetrievalTestMode, string> = {
  default: "沿用该知识库已保存的检索设置",
  vector_only: "仅用语义向量召回文档切片",
  fts_only: "仅用全文关键词召回文档切片",
  ki_only: "仅检索已沉淀的知识条目",
  hybrid: "向量 / 全文 / 知识条目加权合并",
  hybrid_rerank: "混合召回后再用 Rerank 模型精排",
};

// 分数行 label（顺序即展示顺序）
export const SCORE_FIELDS = [
  "vectorScore",
  "ftsScore",
  "kiScore",
  "hybridScore",
  "rerankScore",
  "finalScore",
] as const;

export const SCORE_LABELS: Record<(typeof SCORE_FIELDS)[number], string> = {
  vectorScore: "向量",
  ftsScore: "全文",
  kiScore: "条目",
  hybridScore: "混合",
  rerankScore: "Rerank",
  finalScore: "最终",
};

export const RESULT_TYPE_LABELS: Record<string, string> = {
  child_chunk: "文档切片",
  knowledge_item: "知识条目",
};

export const CHANNEL_LABELS: Record<string, string> = {
  vector: "向量",
  fts: "全文",
  knowledge_item: "知识条目",
};

export const SOURCE_TYPE_LABELS: Record<string, string> = {
  all: "全部来源",
  chunk: "仅文档切片",
  knowledge_item: "仅知识条目",
};

export const DOC_STATUS_FILTER_LABELS: Record<string, string> = {
  all: "全部文档",
  completed: "仅处理完成",
};

export const ITEM_STATUS_FILTER_LABELS: Record<string, string> = {
  all: "全部条目",
  published: "仅已发布",
};

// ── 高级参数默认值（非默认模式的 overrides 起始值，对齐系统默认）──

export type RetrievalWeights = {
  vectorWeight: number;
  ftsWeight: number;
  kiWeight: number;
};

export type AdvancedConfig = RetrievalWeights & {
  topK: number;
  similarityThreshold: number;
  rerankEnabled: boolean;
  rerankTopN: number;
  rerankKeepN: number;
};

export const DEFAULT_ADVANCED: AdvancedConfig = {
  topK: 5,
  similarityThreshold: 0.7,
  rerankEnabled: true,
  rerankTopN: 30,
  rerankKeepN: 10,
  vectorWeight: 0.5,
  ftsWeight: 0.3,
  kiWeight: 0.2,
};

// ── 按模式禁用不相关参数 ──────────────────────────────────────

export type AdvancedParamGroup = "topK" | "threshold" | "rerank" | "weights";

export function disabledParamGroups(mode: RetrievalTestMode): Set<AdvancedParamGroup> {
  // 默认模式：一切读知识库设置，全部高级参数只读
  if (mode === "default") {
    return new Set<AdvancedParamGroup>(["topK", "threshold", "rerank", "weights"]);
  }
  const disabled = new Set<AdvancedParamGroup>();
  // 权重仅对混合检索有意义
  if (mode !== "hybrid" && mode !== "hybrid_rerank") {
    disabled.add("weights");
  }
  // Rerank 仅 hybrid_rerank
  if (mode !== "hybrid_rerank") {
    disabled.add("rerank");
  }
  return disabled;
}

// ── 权重联动：调一个，另两个按比例缩放，总和保持 1 ──────────────

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function rebalanceWeights(
  current: RetrievalWeights,
  key: keyof RetrievalWeights,
  rawValue: number,
): RetrievalWeights {
  const value = clamp01(rawValue);
  const otherKeys = (["vectorWeight", "ftsWeight", "kiWeight"] as (keyof RetrievalWeights)[]).filter(
    (candidate) => candidate !== key,
  );
  const remaining = 1 - value;
  const otherSum = otherKeys.reduce((sum, candidate) => sum + current[candidate], 0);
  const next: RetrievalWeights = { ...current, [key]: value };

  if (otherSum <= 0) {
    // 另两个都为 0：平分剩余权重
    const share = remaining / otherKeys.length;
    for (const candidate of otherKeys) {
      next[candidate] = share;
    }
  } else {
    for (const candidate of otherKeys) {
      next[candidate] = (current[candidate] / otherSum) * remaining;
    }
  }

  return next;
}

export function formatScore(value: number | null): string {
  if (value === null || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(4);
}

export function formatWeight(value: number): string {
  return value.toFixed(2);
}
