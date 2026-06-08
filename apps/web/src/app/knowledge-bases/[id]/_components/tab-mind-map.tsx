"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Edit3Icon, Loader2Icon, NetworkIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, Skeleton } from "@/components/ui/feedback";

import { MindMapCanvas } from "./mind-map/mind-map-canvas";
import { MindMapSearch } from "./mind-map/mind-map-search";
import { MindMapToolbar } from "./mind-map/mind-map-toolbar";
import { useMindMap } from "../_hooks/use-mind-map";
import { type TabValue } from "../_hooks/use-tab-state";

type TabMindMapProps = {
  knowledgeBaseId: string;
  canManage: boolean;
  onJumpTab: (tab: TabValue) => void;
};

export function TabMindMap({ knowledgeBaseId, canManage, onJumpTab }: TabMindMapProps) {
  const {
    mode,
    nodes,
    loading,
    generating,
    saving,
    publishing,
    loadError,
    actionError,
    clearActionError,
    dirty,
    hasPublished,
    enterEdit,
    enterView,
    updateNodeTitle,
    deleteNode,
    addTopic,
    setParent,
    generate,
    save,
    publish,
    reload,
  } = useMindMap(knowledgeBaseId, canManage);

  // 是否处于可编辑态：仅当有管理权限且当前为编辑模式。
  // 发布后 hook 会把 mode 置为 view，此时即便 canManage 也应是只读，不残留工具栏/拖拽。
  const editable = mode === "edit";

  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const matchedIds = useMemo<ReadonlySet<string>>(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return new Set<string>();
    return new Set(
      nodes.filter((n) => n.title.toLowerCase().includes(keyword)).map((n) => n.id),
    );
  }, [search, nodes]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const handleGenerate = useCallback(async () => {
    try {
      const message = await generate();
      if (message) showToast(message);
    } catch {
      // 错误已由 hook 写入 actionError（内联条展示），此处无需额外处理
    }
  }, [generate, showToast]);

  const handleSave = useCallback(async () => {
    const ok = await save();
    if (ok) showToast("已保存草稿");
  }, [save, showToast]);

  const handlePublish = useCallback(async () => {
    const ok = await publish();
    if (ok) {
      showToast("已发布，所有成员可见");
      await enterView(); // 发布成功自动切到查看模式
    }
  }, [publish, showToast, enterView]);

  const handleEnterEdit = useCallback(async () => {
    await enterEdit();
  }, [enterEdit]);

  const handleJump = useCallback(
    (id: string) => {
      const node = nodes.find((n) => n.id === id);
      if (!node) return;
      if (node.type === "document") onJumpTab("documents");
      else if (node.type === "knowledge_item") onJumpTab("knowledge-items");
    },
    [nodes, onJumpTab],
  );

  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-[520px]" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{loadError}</p>
        <div>
          <Button variant="outline" size="sm" onClick={() => void reload()}>
            重试
          </Button>
        </div>
      </div>
    );
  }

  // 操作（生成/保存/发布）失败的内联提示条：保留画布与操作入口，不全屏吞掉
  const actionErrorBar = actionError ? (
    <div className="flex items-center justify-between gap-2 rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">
      <span>{actionError}</span>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={clearActionError}
        className="shrink-0 rounded p-0.5 hover:bg-danger/10"
      >
        <XIcon className="size-4" />
      </button>
    </div>
  ) : null;

  // 空态：member 无 published
  if (!canManage && nodes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actionErrorBar}
        <EmptyState
          icon={<NetworkIcon className="size-8" />}
          title="管理员尚未生成知识关系图"
          description="知识关系图会以思维导图的形式展示该知识库的主题、文档与条目结构。"
        />
      </div>
    );
  }

  // 空态：admin 无 draft 且无 published
  if (canManage && nodes.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        {actionErrorBar}
        <EmptyState
          icon={<NetworkIcon className="size-8" />}
          title="还没有知识关系图"
          description="基于知识库的文档与条目，AI 将自动分析并生成主题分类的思维导图。"
          action={
            <Button onClick={() => void handleGenerate()} disabled={generating} className="gap-1.5">
              {generating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <NetworkIcon className="size-4" />
              )}
              {generating ? "正在生成…" : "生成思维导图"}
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actionErrorBar}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editable ? (
          <MindMapToolbar
            hasNodes={nodes.length > 0}
            dirty={dirty}
            generating={generating}
            saving={saving}
            publishing={publishing}
            onGenerate={() => void handleGenerate()}
            onSave={() => void handleSave()}
            onPublish={() => void handlePublish()}
            onAddTopic={addTopic}
          />
        ) : canManage ? (
          // 管理员处于只读态（如发布后）：提供回到编辑的入口，而非残留工具栏
          <div className="flex items-center gap-2">
            <span className="text-sm text-ink-muted">已发布版本（只读）</span>
            <Button variant="outline" size="sm" onClick={() => void handleEnterEdit()} className="gap-1.5">
              <Edit3Icon className="size-4" />
              进入编辑
            </Button>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">知识关系图（只读）</p>
        )}
        <MindMapSearch value={search} onChange={setSearch} matchCount={matchedIds.size} />
      </div>

      <div className="relative h-[560px] overflow-hidden rounded-lg border border-border bg-neutral-50/60">
        <MindMapCanvas
          nodes={nodes}
          editable={editable}
          matchedIds={matchedIds}
          onRename={updateNodeTitle}
          onDeleteTopic={deleteNode}
          onReparent={setParent}
          onJump={handleJump}
        />

        {generating ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-surface/80 backdrop-blur-sm">
            <Loader2Icon className="size-8 animate-spin text-brand-600" />
            <p className="text-sm text-ink-muted">正在分析知识结构，请稍候…</p>
          </div>
        ) : null}

        {toast ? (
          <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-md bg-neutral-900 px-4 py-2 text-sm text-neutral-50 shadow-md">
            {toast}
          </div>
        ) : null}
      </div>

      {editable && !hasPublished ? (
        <p className="text-xs text-ink-subtle">提示：当前为草稿，发布后成员才能看到知识关系图。</p>
      ) : null}
    </div>
  );
}
