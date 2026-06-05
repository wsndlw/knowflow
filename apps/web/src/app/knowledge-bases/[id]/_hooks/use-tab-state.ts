"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export type TabValue =
  | "overview"
  | "documents"
  | "knowledge-items"
  | "chat"
  | "agents"
  | "members"
  | "analytics"
  | "relations"
  | "retrieval-test"
  | "settings"
  | "improvement"
  | "audit-log";

export function useTabState(validTabs: TabValue[]): {
  activeTab: TabValue;
  setActiveTab: (tab: TabValue) => void;
} {
  const searchParams = useSearchParams();
  const router = useRouter();

  const raw = searchParams.get("tab") ?? "";
  const activeTab: TabValue = validTabs.includes(raw as TabValue)
    ? (raw as TabValue)
    : validTabs[0] ?? "overview";

  const setActiveTab = useCallback(
    (tab: TabValue) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", tab);
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [searchParams, router],
  );

  return { activeTab, setActiveTab };
}
