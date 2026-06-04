import { cn } from "../../lib/cn";

type TrendArrowProps = {
  current: number;
  previous: number;
};

export function TrendArrow({ current, previous }: TrendArrowProps) {
  if (previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  if (change === 0) return null;

  const isUp = change > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        isUp ? "text-success" : "text-danger",
      )}
    >
      <svg viewBox="0 0 12 12" fill="none" className={cn("size-3", !isUp && "rotate-180")} aria-hidden>
        <path d="M6 2.5v7M6 2.5 3 5.5M6 2.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {Math.abs(change).toFixed(0)}%
    </span>
  );
}

type MetricCardProps = {
  label: string;
  value: number | string;
  trend?: { current: number; previous: number };
  className?: string;
};

export function MetricCard({ label, value, trend, className }: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-surface px-4 py-3.5 shadow-xs transition-colors hover:border-brand-200",
        className,
      )}
    >
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</span>
        {trend !== undefined ? <TrendArrow current={trend.current} previous={trend.previous} /> : null}
      </div>
    </div>
  );
}
