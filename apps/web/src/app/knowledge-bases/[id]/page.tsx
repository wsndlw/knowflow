"use client";

import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";

import { Skeleton } from "../../../components/ui/feedback";
import { TabList, type TabItem } from "../../../components/ui/tabs";
import { useKbDetail } from "./_hooks/use-kb-detail";
import { useTabState, type TabValue } from "./_hooks/use-tab-state";
import { DetailHeader } from "./_components/detail-header";
import { TabOverview } from "./_components/tab-overview";
import { TabDocuments } from "./_components/tab-documents";
import { TabKnowledgeItems } from "./_components/tab-knowledge-items";
import { TabAgents } from "./_components/tab-agents";
import { TabMembers } from "./_components/tab-members";
import { TabAnalytics } from "./_components/tab-analytics";
import { TabPlaceholder } from "./_components/tab-placeholder";

const TAB_DEFS: (TabItem & { value: TabValue; manageOnly?: boolean })[] = [
  { value: "overview", label: "概览" },
  { value: "documents", label: "文档" },
  { value: "knowledge-items", label: "知识条目" },
  { value: "agents", label: "专家 Agent", manageOnly: true },
  { value: "members", label: "成员权限", manageOnly: true },
  { value: "analytics", label: "统计分析" },
  { value: "relations", label: "知识关系", manageOnly: true },
  { value: "retrieval-test", label: "检索测试", manageOnly: true },
  { value: "settings", label: "设置", manageOnly: true },
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
  const router = useRouter();
  const knowledgeBaseId = params.id;

  const { kb, overview, canManage, loading, error } = useKbDetail(knowledgeBaseId);

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
      <div className="mx-auto max-w-5xl px-6 py-8">
        <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">
          {error ?? "知识库不存在"}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-6 flex flex-col gap-6">
      <DetailHeader
        kb={kb}
        canManage={canManage}
        onDeleted={() => router.replace("/knowledge-bases")}
      />

      <TabList
        items={tabItems}
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TabValue)}
      />

      <div className="min-h-[300px]">
        {activeTab === "overview" && overview ? (
          <TabOverview kb={kb} overview={overview} canManage={canManage} onJumpTab={setActiveTab} />
        ) : null}
        {activeTab === "documents" ? (
          <TabDocuments knowledgeBaseId={knowledgeBaseId} canManage={canManage} />
        ) : null}
        {activeTab === "knowledge-items" ? (
          <TabKnowledgeItems knowledgeBaseId={knowledgeBaseId} canManage={canManage} />
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
        {activeTab === "relations" ? <TabPlaceholder title="知识关系" /> : null}
        {activeTab === "retrieval-test" ? <TabPlaceholder title="检索测试" /> : null}
        {activeTab === "settings" ? <TabPlaceholder title="设置" /> : null}
        {activeTab === "audit-log" ? <TabPlaceholder title="操作日志" /> : null}
      </div>
    </div>
  );
}

function PageSkeleton() {
  return (
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
  );
}
