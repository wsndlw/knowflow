"use client";

import { useId, useRef, useState } from "react";

import { cn } from "../../lib/cn";

export type CitationPopoverData = {
  index: number;
  title: string;
  knowledgeBaseName: string | null;
  snippet: string | null;
  pageOrSection: string | null;
  href: string | null;
};

/**
 * 正文引用数字标号:悬停/聚焦弹出来源卡片,卡片本身可点击跳转。
 * - fixed 定位,逃逸对话区的 overflow 裁剪
 * - hover 安全区:数字与卡片间留缓冲,鼠标可移到卡片上点击(close 延迟)
 * - 键盘可达:数字是 button,聚焦即展开;卡片是真实链接
 * - 进入动效 + reduced-motion 降级
 */
export function CitationPopover({ data }: { data: CitationPopoverData }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelId = useId();

  function show() {
    if (closeTimer.current !== null) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const rect = anchorRef.current?.getBoundingClientRect();
    if (rect !== undefined) {
      setCoords({ left: rect.left + rect.width / 2, top: rect.top });
    }
    setOpen(true);
  }

  function scheduleClose() {
    closeTimer.current = setTimeout(() => setOpen(false), 140);
  }

  return (
    <span className="relative inline-block">
      <button
        ref={anchorRef}
        type="button"
        aria-describedby={open ? labelId : undefined}
        aria-label={`引用来源 ${String(data.index)}:${data.title}`}
        onMouseEnter={show}
        onMouseLeave={scheduleClose}
        onFocus={show}
        onBlur={scheduleClose}
        className="mx-0.5 inline-flex h-4 min-w-4 translate-y-[-0.4em] items-center justify-center rounded bg-brand-50 px-1 align-baseline text-[0.65rem] font-semibold text-brand-700 transition-colors duration-150 hover:bg-brand-100 focus:bg-brand-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        {data.index}
      </button>

      {open && coords !== null ? (
        <span
          id={labelId}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={scheduleClose}
          style={{ left: coords.left, top: coords.top }}
          className={cn(
            "fixed z-[70] w-72 -translate-x-1/2 -translate-y-[calc(100%+8px)]",
            "motion-safe:animate-[citation-in_120ms_ease-out]",
          )}
        >
          <CitationBody data={data} />
          {/* 下方安全区 + 小三角,鼠标可从数字平移到卡片 */}
          <span className="absolute top-full left-1/2 h-2 w-4 -translate-x-1/2" />
        </span>
      ) : null}

      <style>{`@keyframes citation-in{from{opacity:0;transform:translate(-50%,calc(-100% - 4px))}to{opacity:1;transform:translate(-50%,calc(-100% - 8px))}}`}</style>
    </span>
  );
}

function CitationBody({ data }: { data: CitationPopoverData }) {
  const inner = (
    <>
      <span className="flex items-center gap-1.5">
        <span className="grid size-4 shrink-0 place-items-center rounded bg-brand-50 text-[0.6rem] font-semibold text-brand-700">
          {data.index}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{data.title}</span>
      </span>
      {data.knowledgeBaseName !== null ? (
        <span className="mt-1 block text-xs text-brand-600">
          {data.knowledgeBaseName}
          {data.pageOrSection !== null ? <span className="text-ink-subtle"> · {data.pageOrSection}</span> : null}
        </span>
      ) : null}
      {data.snippet !== null ? (
        <span className="mt-1.5 block line-clamp-3 text-xs leading-relaxed text-ink-muted">
          {data.snippet}
        </span>
      ) : null}
      {data.href !== null ? (
        <span className="mt-2 flex items-center gap-1 text-xs font-medium text-brand-600">
          打开知识库
          <svg viewBox="0 0 16 16" fill="none" className="size-3" aria-hidden>
            <path d="M6 3h7v7M13 3 4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      ) : null}
    </>
  );

  const cardCls =
    "block rounded-lg border border-border bg-surface p-3 text-left shadow-lg";

  return data.href !== null ? (
    <a href={data.href} className={cn(cardCls, "transition-colors hover:border-brand-300")}>
      {inner}
    </a>
  ) : (
    <span className={cardCls}>{inner}</span>
  );
}
