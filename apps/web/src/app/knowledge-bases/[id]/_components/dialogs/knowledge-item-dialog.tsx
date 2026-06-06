"use client";

import { useState, type SyntheticEvent } from "react";
import type { KnowledgeItem } from "@knowflow/shared";

import { Button } from "../../../../../components/ui/button";
import { Dialog } from "../../../../../components/ui/dialog";
import { Input } from "../../../../../components/ui/input";
import { Textarea } from "../../../../../components/ui/textarea";

type KnowledgeItemDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; content: string; summary: string | null }) => Promise<void>;
  editing: KnowledgeItem | null;
};

export function KnowledgeItemDialog({ open, onClose, onSubmit, editing }: KnowledgeItemDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEdit = editing !== null;

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const title = (formData.get("title") as string).trim();
    const content = (formData.get("content") as string).trim();
    const summaryRaw = (formData.get("summary") as string).trim();
    const summary = summaryRaw === "" ? null : summaryRaw;

    if (!title || !content) {
      setError("标题和内容不能为空");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ title, content, summary });
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? "编辑知识条目" : "新建知识条目"}
      footer={
        <div className="flex justify-end gap-2 pt-2 w-full">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="knowledge-item-form" loading={submitting}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </div>
      }
    >
      <form
        id="knowledge-item-form"
        key={editing?.id ?? "new"}
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p className="text-sm text-danger bg-danger-bg px-3 py-2 rounded-md">{error}</p>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">标题</span>
          <Input
            name="title"
            required
            maxLength={255}
            defaultValue={editing?.title ?? ""}
            placeholder="输入知识条目标题"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">内容</span>
          <Textarea
            name="content"
            required
            maxLength={20000}
            rows={6}
            defaultValue={editing?.content ?? ""}
            placeholder="输入知识条目内容"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">摘要(可选)</span>
          <Textarea
            name="summary"
            maxLength={2000}
            rows={2}
            defaultValue={editing?.summary ?? ""}
            placeholder="简要描述该条目"
            className="min-h-16"
          />
        </label>
      </form>
    </Dialog>
  );
}
