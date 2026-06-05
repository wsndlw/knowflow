"use client";

import { memo, useEffect, useRef, useState } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  DatabaseIcon,
  ExternalLinkIcon,
  FileTextIcon,
  FolderIcon,
  ListTreeIcon,
} from "lucide-react";
import { type MindMapNodeType } from "@knowflow/shared";

import { cn } from "@/lib/cn";

export type MindMapNodeData = {
  title: string;
  nodeType: MindMapNodeType;
  referenceId: string | null;
  selected: boolean;
  matched: boolean;
  dimmed: boolean;
  editable: boolean;
};

/** 节点交互回调通过 window 级事件传递成本高，这里用模块级回调注册表桥接 react-flow 节点。 */
type NodeCallbacks = {
  onRename: (id: string, title: string) => void;
  onJump: (id: string) => void;
};
let callbacks: NodeCallbacks = {
  onRename: () => {
    /* 默认空实现，挂载后由 setMindMapNodeCallbacks 注入 */
  },
  onJump: () => {
    /* 默认空实现 */
  },
};
export function setMindMapNodeCallbacks(next: NodeCallbacks): void {
  callbacks = next;
}

const TYPE_STYLES: Record<MindMapNodeType, { box: string; icon: typeof FileTextIcon }> = {
  kb: { box: "bg-brand-50 border-brand-500 text-brand-800", icon: DatabaseIcon },
  topic: { box: "bg-neutral-100 border-neutral-300 text-neutral-700", icon: FolderIcon },
  document: { box: "bg-info-bg border-info text-info", icon: FileTextIcon },
  knowledge_item: { box: "bg-success-bg border-success text-success", icon: ListTreeIcon },
};

function MindMapNodeComponent({ id, data }: NodeProps<MindMapNodeData>) {
  const style = TYPE_STYLES[data.nodeType];
  const Icon = style.icon;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const isJumpable = data.nodeType === "document" || data.nodeType === "knowledge_item";
  const isEditableTitle = data.nodeType === "topic";

  useEffect(() => {
    setDraft(data.title);
  }, [data.title]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== data.title) {
      callbacks.onRename(id, trimmed);
    } else {
      setDraft(data.title);
    }
  }

  return (
    <div
      onDoubleClick={() => {
        if (data.editable && isEditableTitle) setEditing(true);
      }}
      className={cn(
        "relative flex items-center gap-2 rounded-lg border-2 px-3 py-2 shadow-xs transition-all",
        style.box,
        data.selected && "ring-2 ring-ring ring-offset-1",
        data.matched && "ring-2 ring-warning",
        data.dimmed && "opacity-35",
      )}
      style={{ width: 200 }}
    >
      <Handle type="target" position={Position.Top} className="!size-1.5 !border-0 !bg-neutral-400" />
      <Icon className="size-4 shrink-0" aria-hidden />
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(data.title);
              setEditing(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-border bg-surface px-1 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
          // nodrag 让输入框内拖动不触发画布拖拽
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={data.title}>
          {data.title}
        </span>
      )}
      {isJumpable && data.referenceId ? (
        <button
          type="button"
          aria-label="跳转到详情"
          onClick={(e) => {
            e.stopPropagation();
            callbacks.onJump(id);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          // 始终半可见（移动端无 hover 也能看到/点击），hover 时加深
          className="shrink-0 rounded p-0.5 opacity-60 transition-opacity hover:bg-neutral-100 hover:opacity-100"
        >
          <ExternalLinkIcon className="size-3.5" />
        </button>
      ) : null}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-1.5 !border-0 !bg-neutral-400"
      />
    </div>
  );
}

export const MindMapNode = memo(MindMapNodeComponent);
