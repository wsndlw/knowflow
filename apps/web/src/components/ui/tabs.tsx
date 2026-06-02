"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";

import { cn } from "../../lib/cn";

export type TabItem = {
  value: string;
  label: string;
  hidden?: boolean;
};

type TabListProps = {
  items: TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function TabList({ items, value, onValueChange, className }: TabListProps) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const visibleItems = items.filter((item) => !item.hidden);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      const currentIndex = visibleItems.findIndex((item) => item.value === value);
      let nextIndex = currentIndex;

      switch (event.key) {
        case "ArrowRight":
          nextIndex = (currentIndex + 1) % visibleItems.length;
          break;
        case "ArrowLeft":
          nextIndex = (currentIndex - 1 + visibleItems.length) % visibleItems.length;
          break;
        case "Home":
          nextIndex = 0;
          break;
        case "End":
          nextIndex = visibleItems.length - 1;
          break;
        default:
          return;
      }

      event.preventDefault();
      const nextItem = visibleItems[nextIndex];
      if (nextItem !== undefined) {
        onValueChange(nextItem.value);
        tabsRef.current[nextIndex]?.focus();
      }
    },
    [visibleItems, value, onValueChange],
  );

  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-0 border-b border-border overflow-x-auto",
        className,
      )}
    >
      {visibleItems.map((item, index) => {
        const isSelected = item.value === value;
        return (
          <button
            key={item.value}
            ref={(el) => { tabsRef.current[index] = el; }}
            role="tab"
            type="button"
            id={`tab-${item.value}`}
            aria-selected={isSelected}
            aria-controls={`tabpanel-${item.value}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "shrink-0 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors duration-150",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-inset",
              isSelected
                ? "border-b-2 border-brand-600 text-brand-700"
                : "border-b-2 border-transparent text-ink-muted hover:text-ink hover:border-neutral-300",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

type TabPanelProps = {
  value: string;
  activeValue: string;
  children: React.ReactNode;
  className?: string;
};

export function TabPanel({ value, activeValue, children, className }: TabPanelProps) {
  if (value !== activeValue) return null;
  return (
    <div
      role="tabpanel"
      id={`tabpanel-${value}`}
      aria-labelledby={`tab-${value}`}
      className={className}
    >
      {children}
    </div>
  );
}
