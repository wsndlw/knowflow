import dagre from "dagre";
import { MarkerType, type Edge, type Node } from "reactflow";

import { type EditableNode } from "../../_hooks/use-mind-map";
import { type MindMapNodeData } from "./mind-map-node";

export const NODE_WIDTH = 200;
export const NODE_HEIGHT = 52;

type LayoutInput = {
  nodes: EditableNode[];
  /** 当前选中节点 id */
  selectedId: string | null;
  /** 搜索高亮命中的节点 id 集合 */
  matchedIds: ReadonlySet<string>;
  /** 是否可编辑（影响节点是否可拖拽） */
  editable: boolean;
};

/**
 * 用 dagre 计算竖向树布局（rankdir TB），输出 react-flow 的 nodes/edges。
 */
export function layoutMindMap({
  nodes,
  selectedId,
  matchedIds,
  editable,
}: LayoutInput): { rfNodes: Node<MindMapNodeData>[]; rfEdges: Edge[] } {
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

  const rfNodes: Node<MindMapNodeData>[] = nodes.map((node) => {
    const pos = graph.node(node.id);
    return {
      id: node.id,
      type: "mindMap",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
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
    };
  });

  return { rfNodes, rfEdges: edges };
}
