"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateMindMapResponseSchema,
  mindMapResponseSchema,
  type MindMapNode,
  type MindMapNodeType,
} from "@knowflow/shared";

import { apiRequest } from "@/lib/api";
import { translateApiError } from "@/lib/api-error";

/** 画布编辑用的规范化节点（不含服务端派生字段）。 */
export type EditableNode = {
  id: string;
  parentId: string | null;
  type: MindMapNodeType;
  title: string;
  referenceId: string | null;
};

export type MindMapMode = "view" | "edit";

type UseMindMapReturn = {
  mode: MindMapMode;
  nodes: EditableNode[];
  loading: boolean;
  generating: boolean;
  saving: boolean;
  publishing: boolean;
  /** 初始加载/重载/切换视图失败：此时无可用画布，适合全屏错误。 */
  loadError: string | null;
  /** 生成/保存/发布等操作失败：画布仍在，用内联条提示，不吞操作入口。 */
  actionError: string | null;
  clearActionError: () => void;
  dirty: boolean;
  hasPublished: boolean;
  hasDraft: boolean;
  enterEdit: () => Promise<void>;
  enterView: () => Promise<void>;
  updateNodeTitle: (id: string, title: string) => void;
  deleteNode: (id: string) => void;
  addTopic: (title: string) => void;
  setParent: (nodeId: string, parentId: string) => void;
  generate: () => Promise<string | null>;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  reload: () => Promise<void>;
};

function newId(): string {
  return crypto.randomUUID();
}

function toEditable(node: MindMapNode): EditableNode {
  return {
    id: node.id,
    parentId: node.parentId,
    type: node.type,
    title: node.title,
    referenceId: node.referenceId,
  };
}

/**
 * 用 published 克隆一份作为编辑起点：重新生成每个节点 uuid，
 * 同步重映射 parentId 引用（保持树结构）。
 */
function clonePublished(published: MindMapNode[]): EditableNode[] {
  const idMap = new Map<string, string>();
  for (const node of published) {
    idMap.set(node.id, newId());
  }
  return published.map((node) => ({
    id: idMap.get(node.id) ?? newId(),
    parentId: node.parentId ? (idMap.get(node.parentId) ?? null) : null,
    type: node.type,
    title: node.title,
    referenceId: node.referenceId,
  }));
}

/** 判断 candidateParent 是否为 nodeId 的后代（用于防止拖拽形成环）。 */
function isDescendant(nodes: EditableNode[], nodeId: string, candidateParent: string): boolean {
  let cursor: string | null = candidateParent;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === nodeId) return true;
    if (guard.has(cursor)) break;
    guard.add(cursor);
    cursor = byId.get(cursor)?.parentId ?? null;
  }
  return false;
}

/** 拼 PUT /mind-map 全量替换 body（save 与 publish 前置保存共用，避免两处漂移）。 */
function buildSaveBody(nodes: EditableNode[]): { nodes: EditableNode[] } {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId,
      type: n.type,
      title: n.title,
      referenceId: n.referenceId,
    })),
  };
}

export function useMindMap(knowledgeBaseId: string, canManage: boolean): UseMindMapReturn {
  const [mode, setMode] = useState<MindMapMode>(canManage ? "edit" : "view");
  const [nodes, setNodes] = useState<EditableNode[]>([]);
  const nodesRef = useRef<EditableNode[]>([]);
  nodesRef.current = nodes;
  const [publishedNodes, setPublishedNodes] = useState<MindMapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const clearActionError = useCallback(() => setActionError(null), []);

  const fetchPublished = useCallback(async (): Promise<MindMapNode[]> => {
    const data = await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/mind-map`,
      mindMapResponseSchema,
      { cache: "no-store" },
    );
    return data.nodes;
  }, [knowledgeBaseId]);

  const fetchDraft = useCallback(async (): Promise<MindMapNode[]> => {
    const data = await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/mind-map/draft`,
      mindMapResponseSchema,
      { cache: "no-store" },
    );
    return data.nodes;
  }, [knowledgeBaseId]);

  /** 初始加载：member 看 published；admin 进编辑态（draft 为空但有 published 则克隆）。 */
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      if (!canManage) {
        const published = await fetchPublished();
        setPublishedNodes(published);
        setNodes(published.map(toEditable));
        setMode("view");
        setDirty(false);
        return;
      }

      const [draft, published] = await Promise.all([fetchDraft(), fetchPublished()]);
      setPublishedNodes(published);
      if (draft.length > 0) {
        setNodes(draft.map(toEditable));
      } else if (published.length > 0) {
        // publish 已消耗 draft：用 published 克隆一份作为编辑起点，视为干净基线
        setNodes(clonePublished(published));
      } else {
        setNodes([]);
      }
      setMode("edit");
      setDirty(false); // 刚加载完即为干净基线，用户真正编辑后才标记未保存
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? translateApiError(caught.message) : "加载思维导图失败",
      );
    } finally {
      setLoading(false);
    }
  }, [canManage, fetchDraft, fetchPublished]);

  useEffect(() => {
    void load();
  }, [load]);

  const enterEdit = useCallback(async () => {
    if (!canManage) return;
    await load();
  }, [canManage, load]);

  const enterView = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const published = await fetchPublished();
      setPublishedNodes(published);
      setNodes(published.map(toEditable));
      setMode("view");
      setDirty(false);
    } catch (caught) {
      setLoadError(
        caught instanceof Error ? translateApiError(caught.message) : "加载思维导图失败",
      );
    } finally {
      setLoading(false);
    }
  }, [fetchPublished]);

  const updateNodeTitle = useCallback((id: string, title: string) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, title } : n)));
    setDirty(true);
  }, []);

  /** 删除 topic 节点：其子节点上挂到被删节点的父级，避免丢失文档/条目。 */
  const deleteNode = useCallback((id: string) => {
    setNodes((prev) => {
      const target = prev.find((n) => n.id === id);
      if (target?.type !== "topic") return prev;
      return prev
        .filter((n) => n.id !== id)
        .map((n) => (n.parentId === id ? { ...n, parentId: target.parentId } : n));
    });
    setDirty(true);
  }, []);

  const addTopic = useCallback((title: string) => {
    setNodes((prev) => {
      const root = prev.find((n) => n.type === "kb");
      const topic: EditableNode = {
        id: newId(),
        parentId: root?.id ?? null,
        type: "topic",
        title,
        referenceId: null,
      };
      return [...prev, topic];
    });
    setDirty(true);
  }, []);

  /** 改父子关系；拒绝形成环（拖到自身后代上）。 */
  const setParent = useCallback(
    (nodeId: string, parentId: string) => {
      const current = nodesRef.current;
      const node = current.find((n) => n.id === nodeId);
      if (!node || node.type === "kb") return; // 根不可移动
      if (nodeId === parentId) return;
      if (isDescendant(current, nodeId, parentId)) return; // 防环
      setNodes((prev) => prev.map((n) => (n.id === nodeId ? { ...n, parentId } : n)));
      setDirty(true);
    },
    [],
  );

  const generate = useCallback(async (): Promise<string | null> => {
    setGenerating(true);
    setActionError(null);
    try {
      const data = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/mind-map/generate`,
        generateMindMapResponseSchema,
        { method: "POST" },
      );
      // generate 已自动存为 draft，直接渲染返回的 nodes，无需再 save
      setNodes(data.nodes.map(toEditable));
      setDirty(false);
      return data.message;
    } catch (caught) {
      setActionError(
        caught instanceof Error ? translateApiError(caught.message) : "生成思维导图失败",
      );
      throw caught;
    } finally {
      setGenerating(false);
    }
  }, [knowledgeBaseId]);

  const save = useCallback(async (): Promise<boolean> => {
    setSaving(true);
    setActionError(null);
    try {
      // PUT = 全量替换：提交整棵树完整 nodes；数组顺序即 sortOrder（后端按索引重排）
      const body = buildSaveBody(nodes);
      const data = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/mind-map`,
        mindMapResponseSchema,
        { method: "PUT", body: JSON.stringify(body) },
      );
      setNodes(data.nodes.map(toEditable));
      setDirty(false);
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? translateApiError(caught.message) : "保存失败");
      return false;
    } finally {
      setSaving(false);
    }
  }, [knowledgeBaseId, nodes]);

  const publish = useCallback(async (): Promise<boolean> => {
    setPublishing(true);
    setActionError(null);
    try {
      // 发布前无条件把当前画布先保存为 draft：后端 publish 是「消耗式提升」(删 published、提升 draft)，
      // 而已发布过的 KB 进编辑态时屏幕是克隆基线、draft 表已为空。若跳过保存直接发布，会把空 draft
      // 提升、published 被清空 → 线上思维导图丢失。无条件保存可杜绝「draft 与屏幕不一致」整类问题。
      const body = buildSaveBody(nodes);
      await apiRequest(`/knowledge-bases/${knowledgeBaseId}/mind-map`, mindMapResponseSchema, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      setDirty(false);
      const data = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/mind-map/publish`,
        mindMapResponseSchema,
        { method: "POST" },
      );
      setPublishedNodes(data.nodes);
      return true;
    } catch (caught) {
      setActionError(caught instanceof Error ? translateApiError(caught.message) : "发布失败");
      return false;
    } finally {
      setPublishing(false);
    }
  }, [knowledgeBaseId, nodes]);

  return {
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
    hasPublished: publishedNodes.length > 0,
    hasDraft: nodes.length > 0,
    enterEdit,
    enterView,
    updateNodeTitle,
    deleteNode,
    addTopic,
    setParent,
    generate,
    save,
    publish,
    reload: load,
  };
}
