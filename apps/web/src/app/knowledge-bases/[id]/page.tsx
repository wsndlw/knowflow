"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
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

const TAB_DEFS: (TabItem & { value: TabValue; manageOnly?: boolean })[] = [
  { value: "overview", label: "概览" },
  { value: "documents", label: "文档" },
  { value: "knowledge-items", label: "知识条目" },
  { value: "chat", label: "专家 Agent", manageOnly: false },
  { value: "agents", label: "专家 Agent 管理", manageOnly: true },
  { value: "members", label: "成员权限", manageOnly: true },
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

  const { kb, overview, canManage, loading, error, reload } = useKbDetail(knowledgeBaseId);

  const visibleTabs = TAB_DEFS
    .filter((tab) => !tab.manageOnly || canManage)
    .map((tab) => tab.value);

  const tabItems: TabItem[] = TAB_DEFS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    hidden: tab.manageOnly === true && !canManage,
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
        <DetailHeader kb={kb} />
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
          "flex-1 flex flex-col min-h-0 mx-auto w-full max-w-5xl px-6 pb-6 mt-6",
          activeTab === "chat" ? "" : "overflow-y-auto"
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
