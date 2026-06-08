"use client";

import { Suspense, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cn } from "../../../lib/cn";
import { Skeleton } from "../../../components/ui/feedback";
import { TabList, type TabItem } from "../../../components/ui/tabs";
import { useKbDetail } from "./_hooks/use-kb-detail";
import { useTabState, type TabValue } from "./_hooks/use-tab-state";
import { DetailHeader } from "./_components/detail-header";
import { TabOverview } from "./_components/tab-overview";
import { TabDocuments } from "./_components/tab-documents";
import { TabKnowledgeItems } from "./_components/tab-knowledge-items";
import { TabChat } from "./_components/tab-chat";
import { TabAgents } from "./_components/tab-agents";
import { TabMembers } from "./_components/tab-members";
import { TabAnalytics } from "./_components/tab-analytics";
import { TabAuditLogs } from "./_components/tab-audit-logs";
import { TabMindMap } from "./_components/tab-mind-map";
import { TabRetrievalTest } from "./_components/tab-retrieval-test";
import { TabSettings } from "./_components/tab-settings";
import { TabImprovement } from "./_components/tab-improvement";

const TAB_DEFS: (TabItem & {
  value: TabValue;
  manageOnly?: boolean;
  restrictedOnly?: boolean;
})[] = [
  { value: "overview", label: "概览" },
  { value: "documents", label: "文档" },
  { value: "knowledge-items", label: "知识条目" },
  { value: "chat", label: "专家 Agent", manageOnly: false },
  { value: "agents", label: "专家 Agent 管理", manageOnly: true },
  // 成员名单仅在「受限」可见范围下作为访问依据，故只有受限知识库才展示该 tab
  { value: "members", label: "成员权限", manageOnly: true, restrictedOnly: true },
  { value: "analytics", label: "统计分析" },
  { value: "relations", label: "知识关系" },
  { value: "retrieval-test", label: "检索测试", manageOnly: true },
  { value: "settings", label: "设置", manageOnly: true },
  { value: "improvement", label: "知识改进", manageOnly: true },
  { value: "audit-log", label: "操作日志", manageOnly: true },
];

export default function KnowledgeBaseDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <KnowledgeBaseDetailContent />
    </Suspense>
  );
}

function KnowledgeBaseDetailContent() {
  const params = useParams<{ id: string }>();
  const knowledgeBaseId = params.id;
  const searchParams = useSearchParams();
  const router = useRouter();

  const { kb, overview, canManage, loading, error, reload } = useKbDetail(knowledgeBaseId);

  // 仅管理员可进入管理模式;普通用户即使带 ?mode=manage 也不解锁管理 tab。
  // 这是视图收纳而非权限——后端校验始终兜底。
  const isManageMode = canManage && searchParams.get("mode") === "manage";

  const setManageMode = useCallback(
    (next: boolean) => {
      const sp = new URLSearchParams(searchParams.toString());
      if (next) {
        sp.set("mode", "manage");
      } else {
        sp.delete("mode");
        sp.delete("tab"); // 退出管理模式时若停在管理 tab,回落到默认消费 tab
      }
      const query = sp.toString();
      router.push(query === "" ? "?" : `?${query}`, { scroll: false });
    },
    [searchParams, router],
  );

  // 受限知识库才把成员名单作为访问依据，非受限库隐藏「成员权限」tab（详见后端 access 逻辑）
  const isRestricted = kb?.visibility === "restricted";
  const isTabVisible = (tab: (typeof TAB_DEFS)[number]): boolean =>
    (!tab.manageOnly || isManageMode) && (!tab.restrictedOnly || isRestricted);

  const visibleTabs = TAB_DEFS.filter(isTabVisible).map((tab) => tab.value);

  const tabItems: TabItem[] = TAB_DEFS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    hidden: !isTabVisible(tab),
  }));

  const { activeTab, setActiveTab } = useTabState(visibleTabs);

  if (loading) return <PageSkeleton />;

  if (error || !kb) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-background w-full">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          {error ?? "知识库不存在"}
        </p>
      </div>
    </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background w-full">
      <div className="shrink-0 px-6 pt-6 mx-auto w-full max-w-5xl flex flex-col gap-6">
        <DetailHeader
          kb={kb}
          canManage={canManage}
          isManageMode={isManageMode}
          onManageModeChange={setManageMode}
        />
        <TabList
          items={tabItems}
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
        />
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className={cn(
          "flex-1 flex flex-col min-h-0 w-full",
          activeTab === "chat"
            ? "overflow-hidden"
            : "mx-auto max-w-5xl px-6 pb-6 pt-6 overflow-y-auto"
        )}
      >
        {activeTab === "overview" && overview ? (
          <TabOverview kb={kb} overview={overview} />
        ) : null}
        {activeTab === "documents" ? (
          <TabDocuments knowledgeBaseId={knowledgeBaseId} canManage={canManage} />
        ) : null}
        {activeTab === "knowledge-items" ? (
          <TabKnowledgeItems knowledgeBaseId={knowledgeBaseId} canManage={canManage} />
        ) : null}
        {activeTab === "chat" ? (
          <TabChat knowledgeBaseId={knowledgeBaseId} />
        ) : null}
        {activeTab === "agents" ? (
          <TabAgents knowledgeBaseId={knowledgeBaseId} />
        ) : null}
        {activeTab === "members" ? (
          <TabMembers knowledgeBaseId={knowledgeBaseId} canManage={canManage} />
        ) : null}
        {activeTab === "analytics" ? (
          <TabAnalytics knowledgeBaseId={knowledgeBaseId} />
        ) : null}
        {activeTab === "relations" ? (
          <TabMindMap
            knowledgeBaseId={knowledgeBaseId}
            canManage={canManage}
            onJumpTab={setActiveTab}
          />
        ) : null}
        {activeTab === "retrieval-test" ? (
          <TabRetrievalTest knowledgeBaseId={knowledgeBaseId} />
        ) : null}
        {activeTab === "settings" ? (
          <TabSettings
            knowledgeBaseId={knowledgeBaseId}
            kbName={kb.name}
            kbStatus={kb.status}
            onStatusChanged={reload}
          />
        ) : null}
        {activeTab === "improvement" ? (
          <TabImprovement knowledgeBaseId={knowledgeBaseId} />
        ) : null}
        {activeTab === "audit-log" ? (
          <TabAuditLogs knowledgeBaseId={knowledgeBaseId} onJumpTab={setActiveTab} />
        ) : null}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background w-full">
      <div className="mx-auto max-w-5xl px-6 py-6 flex flex-col gap-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-48" />
      </div>
    </div>
  );
}
