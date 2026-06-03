"use client";

/**
 * 图表基元 —— 基于 recharts 的统计可视化封装。
 *
 * 约束（CC-主控 样式硬约束）：
 * - 颜色一律走语义 token（CSS 变量 `var(--color-*)`），禁止硬编码 hex。
 *   主色后续要换飞书蓝，用 token 则自动跟随。
 * - SVG fill/stroke 直接引用 CSS 变量，浏览器渲染时解析为实际 OKLCH 值。
 */

import type { ReactNode } from "react";

// 分类调色板：主色 + 语义色，按需循环取用。全部为 token CSS 变量。
export const CHART_COLORS = [
  "var(--color-brand-500)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-brand-300)",
  "var(--color-danger)",
] as const;

export function chartColor(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length] as string;
}

// 坐标轴/网格统一样式（token 色）。
export const AXIS_TICK_STYLE = {
  fill: "var(--color-ink-muted)",
  fontSize: 12,
} as const;

export const AXIS_LINE_STYLE = {
  stroke: "var(--color-border)",
} as const;

export const GRID_STYLE = {
  stroke: "var(--color-border)",
} as const;

// Tooltip 主题：表面色背景 + 边框 token + 柔和阴影。
export const TOOLTIP_CONTENT_STYLE = {
  backgroundColor: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-md)",
  fontSize: 12,
  color: "var(--color-ink)",
  padding: "8px 12px",
} as const;

export const TOOLTIP_LABEL_STYLE = {
  color: "var(--color-ink)",
  fontWeight: 600,
  marginBottom: 2,
} as const;

export const TOOLTIP_ITEM_STYLE = {
  color: "var(--color-ink-muted)",
} as const;

export const LEGEND_STYLE = {
  fontSize: 12,
  color: "var(--color-ink-muted)",
} as const;

/** 图表外壳：标题 + 固定高度容器，统一卡片留白与三态外的“有数据”渲染。 */
export function ChartFrame({
  title,
  height = 240,
  children,
}: {
  title?: string;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      {title !== undefined ? (
        <h3 className="mb-3 text-md font-medium text-ink">{title}</h3>
      ) : null}
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}
