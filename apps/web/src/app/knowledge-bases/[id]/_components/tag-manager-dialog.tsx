"use client";

import { useState, type SyntheticEvent } from "react";
import { ArrowLeftIcon } from "lucide-react";
import type { CreateTagRequest, KnowledgeTag } from "@knowflow/shared";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/feedback";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

// 12 预设色（提交 hex 值，绝不传色名）
const PRESET_COLORS = [
  "#64748B",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#14B8A6",
  "#06B6D4",
  "#3B82F6",
  "#8B5CF6",
];
const DEFAULT_TAG_COLOR = "#64748B";
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

function isValidHex(value: string): boolean {
  return HEX_PATTERN.test(value);
}

type TagManagerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: KnowledgeTag[];
  loading: boolean;
  onCreate: (body: CreateTagRequest) => Promise<KnowledgeTag>;
  onUpdate: (tagId: string, body: { name: string; color: string }) => Promise<KnowledgeTag>;
  onDelete: (tagId: string) => Promise<void>;
};

export function TagManagerDialog({
  open,
  onOpenChange,
  tags,
  loading,
  onCreate,
  onUpdate,
  onDelete,
}: TagManagerDialogProps) {
  const [mode, setMode] = useState<"list" | "create">("list");
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeTag | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setMode("list");
      setDeleteError(null);
      setDeleteTarget(null);
    }
  }

  async function confirmDelete() {
    if (deleteTarget === null) {
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          {mode === "list" ? (
            <>
              <DialogHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-1 text-left">
                  <DialogTitle>标签管理</DialogTitle>
                  <DialogDescription>编辑或删除该知识库的标签。</DialogDescription>
                </div>
                {!loading && tags.length > 0 && (
                  <Button size="sm" onClick={() => setMode("create")}>
                    新建标签
                  </Button>
                )}
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-2">
                <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
                  {loading ? (
                    <>
                      <Skeleton className="h-10" />
                      <Skeleton className="h-10" />
                    </>
                  ) : tags.length === 0 ? (
                    <EmptyState
                      title="暂无标签"
                      description="创建标签以便对知识库中的文档与条目进行分类。"
                      className="py-8"
                      action={
                        <Button size="sm" onClick={() => setMode("create")}>
                          新建第一个标签
                        </Button>
                      }
                    />
                  ) : (
                    tags.map((tag) => (
                      <TagRow key={tag.id} tag={tag} onUpdate={onUpdate} onDelete={setDeleteTarget} />
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="flex flex-row items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 rounded-full hover:bg-neutral-100"
                  onClick={() => setMode("list")}
                  aria-label="返回列表"
                >
                  <ArrowLeftIcon className="size-4" />
                </Button>
                <div className="flex flex-col gap-1 text-left">
                  <DialogTitle>新建标签</DialogTitle>
                  <DialogDescription>输入标签名称并选择标签颜色。</DialogDescription>
                </div>
              </DialogHeader>

              <div className="flex flex-col gap-4 mt-2">
                <TagForm
                  submitLabel="创建"
                  resetAfterSubmit
                  onSubmit={async (name, color) => {
                    await onCreate({ name, color });
                    setMode("list");
                  }}
                  onCancel={() => setMode("list")}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除标签</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除标签「{deleteTarget?.name ?? ""}」吗？该操作会同时移除所有文档与条目上的此标签，且不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError !== null ? (
            <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{deleteError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? "删除中…" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function TagRow({
  tag,
  onUpdate,
  onDelete,
}: {
  tag: KnowledgeTag;
  onUpdate: (tagId: string, body: { name: string; color: string }) => Promise<KnowledgeTag>;
  onDelete: (tag: KnowledgeTag) => void;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div className="rounded-md border border-brand-300 p-3">
        <TagForm
          initialName={tag.name}
          initialColor={tag.color}
          submitLabel="保存"
          onSubmit={async (name, color) => {
            await onUpdate(tag.id, { name, color });
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <span
        className="size-3 shrink-0 rounded-full"
        style={{ backgroundColor: tag.color }}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-ink">{tag.name}</span>
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        编辑
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onDelete(tag)}>
        删除
      </Button>
    </div>
  );
}

function TagForm({
  initialName = "",
  initialColor = DEFAULT_TAG_COLOR,
  submitLabel,
  resetAfterSubmit = false,
  onSubmit,
  onCancel,
}: {
  initialName?: string;
  initialColor?: string;
  submitLabel: string;
  resetAfterSubmit?: boolean;
  onSubmit: (name: string, color: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const valid = trimmed.length > 0 && trimmed.length <= 80 && isValidHex(color);

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || saving) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(trimmed, color);
      if (resetAfterSubmit) {
        setName("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3">
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="标签名称"
        maxLength={80}
        aria-label="标签名称"
      />
      <ColorPicker value={color} onChange={setColor} />
      {error !== null ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel !== undefined ? (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            取消
          </Button>
        ) : null}
        <Button type="submit" size="sm" loading={saving} disabled={!valid}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-6 gap-2">
        {PRESET_COLORS.map((preset) => {
          const active = value.toLowerCase() === preset.toLowerCase();
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              aria-label={`选择颜色 ${preset}`}
              aria-pressed={active}
              className={cn(
                "size-6 rounded-full border transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                active ? "border-transparent ring-2 ring-brand-500 ring-offset-2" : "border-border",
              )}
              style={{ backgroundColor: preset }}
            />
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <span
          className="size-5 shrink-0 rounded-full border border-border"
          style={{ backgroundColor: isValidHex(value) ? value : "transparent" }}
          aria-hidden
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="#RRGGBB"
          maxLength={7}
          aria-label="自定义颜色（hex）"
          invalid={!isValidHex(value)}
          className="h-8 w-28 font-mono text-xs"
        />
      </div>
    </div>
  );
}
