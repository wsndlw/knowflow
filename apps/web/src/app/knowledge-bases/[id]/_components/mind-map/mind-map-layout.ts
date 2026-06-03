import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "reactflow";

import { type EditableNode } from "../../_hooks/use-mind-map";
import { type MindMapNodeData } from "./mind-map-node";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 52;

export type NodePosition = { x: number; y: number };

/**
 * 仅依赖节点「结构」（id/parentId）计算 dagre 竖向树布局（rankdir TB）。
 * 选中/搜索等装饰态变化不应触发本函数 —— 故与节点装饰分离，避免无谓重算布局。
 */
export function computeDagreLayout(nodes: EditableNode[]): {
  positions: Map<string, NodePosition>;
  edges: Edge[];
} {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100 });

  const ids = new Set(nodes.map((n) => n.id));

  for (const node of nodes) {
    graph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  const edges: Edge[] = [];
  for (const node of nodes) {
    if (node.parentId && ids.has(node.parentId)) {
      graph.setEdge(node.parentId, node.id);
      edges.push({
        id: `${node.parentId}-${node.id}`,
        source: node.parentId,
        target: node.id,
        type: "straight",
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: "var(--color-neutral-300)", strokeWidth: 1.5 },
      });
    }
  }

  dagre.layout(graph);

  const positions = new Map<string, NodePosition>();
  for (const node of nodes) {
    const pos = graph.node(node.id);
    positions.set(node.id, { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 });
  }
  return { positions, edges };
}

type Decoration = {
  selectedId: string | null;
  matchedIds: ReadonlySet<string>;
  editable: boolean;
};

/**
 * 用已算好的位置 + 当前装饰态组装 react-flow 节点（纯 map，不跑 dagre）。
 * 选中/搜索仅触发本函数，开销低。
 */
export function buildRfNodes(
  nodes: EditableNode[],
  positions: Map<string, NodePosition>,
  { selectedId, matchedIds, editable }: Decoration,
): Node<MindMapNodeData>[] {
  return nodes.map((node) => ({
    id: node.id,
    type: "mindMap",
    position: positions.get(node.id) ?? { x: 0, y: 0 },
    data: {
      title: node.title,
      nodeType: node.type,
      referenceId: node.referenceId,
      selected: node.id === selectedId,
      matched: matchedIds.has(node.id),
      dimmed: matchedIds.size > 0 && !matchedIds.has(node.id),
      editable,
    },
    draggable: editable && node.type !== "kb",
  }));
}
