"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
  type OnNodesChange,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

import { type EditableNode } from "../../_hooks/use-mind-map";
import { buildRfNodes, computeDagreLayout } from "./mind-map-layout";
import { MindMapNode, setMindMapNodeCallbacks, type MindMapNodeData } from "./mind-map-node";

const NODE_TYPES = { mindMap: MindMapNode };

const TYPE_MINIMAP_COLOR: Record<string, string> = {
  kb: "#0d9488",
  topic: "#a3a3a3",
  document: "#3b82f6",
  knowledge_item: "#22c55e",
};

type MindMapCanvasProps = {
  nodes: EditableNode[];
  editable: boolean;
  /** 命中节点 id 集合，由父组件计算 */
  matchedIds: ReadonlySet<string>;
  onRename: (id: string, title: string) => void;
  onDeleteTopic: (id: string) => void;
  onReparent: (nodeId: string, parentId: string) => void;
  onJump: (id: string) => void;
};

function CanvasInner({
  nodes,
  editable,
  matchedIds,
  onRename,
  onDeleteTopic,
  onReparent,
  onJump,
}: MindMapCanvasProps) {
  const { fitView } = useReactFlow();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [contextNode, setContextNode] = useState<EditableNode | null>(null);
  const dragOverRef = useRef<string | null>(null);

  // 注册节点内部回调（react-flow 节点无法直接拿到外层闭包）
  useEffect(() => {
    setMindMapNodeCallbacks({ onRename, onJump });
  }, [onRename, onJump]);

  // 第一层：仅在节点结构（增删/改父子/改名）变化时跑 dagre 布局。
  // 选中、搜索等装饰态变化时 nodes 引用不变，不会重算布局。
  const { positions, edges: rfEdges } = useMemo(() => computeDagreLayout(nodes), [nodes]);

  // 第二层：用已算好的位置 + 当前装饰态组装节点（纯 map，开销低）。
  const rfNodes = useMemo<Node<MindMapNodeData>[]>(
    () => buildRfNodes(nodes, positions, { selectedId, matchedIds, editable }),
    [nodes, positions, selectedId, matchedIds, editable],
  );

  // 初始与节点结构变化后居中
  useEffect(() => {
    const timer = window.setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 60);
    return () => window.clearTimeout(timer);
  }, [nodes.length, fitView]);

  // 搜索命中后居中到命中节点
  useEffect(() => {
    if (matchedIds.size === 0) return;
    const timer = window.setTimeout(
      () => fitView({ padding: 0.3, duration: 400, nodes: [...matchedIds].map((id) => ({ id })) }),
      60,
    );
    return () => window.clearTimeout(timer);
  }, [matchedIds, fitView]);

  const onNodesChange = useCallback<OnNodesChange>(() => {
    // 布局由 dagre 接管，位置变更不写回；此处仅满足受控组件签名
  }, []);

  const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
    setSelectedId(node.id);
  }, []);

  // 拖拽改父子关系：松手时若悬停在某节点上，则 reparent
  const handleNodeDragStart = useCallback(() => {
    dragOverRef.current = null;
  }, []);

  const handleNodeDrag = useCallback(
    (_evt: React.MouseEvent, dragged: Node) => {
      // 用几何相交判断悬停目标（dagre 布局坐标）
      const target = rfNodes.find((n) => {
        if (n.id === dragged.id) return false;
        const dx = Math.abs(n.position.x - dragged.position.x);
        const dy = Math.abs(n.position.y - dragged.position.y);
        return dx < 140 && dy < 40;
      });
      dragOverRef.current = target?.id ?? null;
    },
    [rfNodes],
  );

  const handleNodeDragStop = useCallback(
    (_evt: React.MouseEvent, dragged: Node) => {
      const targetId = dragOverRef.current;
      dragOverRef.current = null;
      if (targetId && targetId !== dragged.id) {
        onReparent(dragged.id, targetId);
      }
    },
    [onReparent],
  );

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) setContextNode(null);
      }}
    >
      <ContextMenuTrigger asChild disabled={!editable}>
        <div className="size-full">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onNodeClick={handleNodeClick}
            onNodeContextMenu={(_e, node) => {
              const match = nodes.find((n) => n.id === node.id) ?? null;
              setContextNode(match);
              setSelectedId(node.id);
            }}
            onNodeDragStart={handleNodeDragStart}
            onNodeDrag={handleNodeDrag}
            onNodeDragStop={handleNodeDragStop}
            nodesDraggable={editable}
            nodesConnectable={false}
            elementsSelectable
            fitView
            minZoom={0.2}
            maxZoom={1.8}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--color-neutral-200)" gap={20} />
            <Controls showInteractive={editable} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                TYPE_MINIMAP_COLOR[(n.data as MindMapNodeData | undefined)?.nodeType ?? "topic"] ??
                "#a3a3a3"
              }
              className="!bg-surface"
            />
          </ReactFlow>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {contextNode?.type === "topic" ? (
          <ContextMenuItem
            variant="destructive"
            onSelect={() => {
              onDeleteTopic(contextNode.id);
            }}
          >
            删除主题节点
          </ContextMenuItem>
        ) : (
          <ContextMenuItem disabled>
            {contextNode?.type === "kb" ? "知识库根节点不可删除" : "该节点不可删除，仅可移动"}
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function MindMapCanvas(props: MindMapCanvasProps) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}
