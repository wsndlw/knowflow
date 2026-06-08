"use client";

import { useState, type SyntheticEvent } from "react";
import type { ManagedAgent } from "@knowflow/shared";

import { Button } from "../../../../../components/ui/button";
import { Dialog } from "../../../../../components/ui/dialog";
import { Input } from "../../../../../components/ui/input";
import { Textarea } from "../../../../../components/ui/textarea";

type AgentDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AgentFormData) => Promise<void>;
  editing: ManagedAgent | null;
};

export type AgentFormData = {
  name: string;
  description: string | null;
  systemPrompt: string;
  openingMessage: string | null;
  recommendedQuestions: string[];
};

export function AgentDialog({ open, onClose, onSubmit, editing }: AgentDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>(
    editing?.recommendedQuestions ?? [""],
  );
  const isEdit = editing !== null;

  function handleAddQuestion() {
    if (questions.length >= 5) return;
    setQuestions([...questions, ""]);
  }

  function handleRemoveQuestion(index: number) {
    setQuestions(questions.filter((_, i) => i !== index));
  }

  function handleQuestionChange(index: number, value: string) {
    setQuestions(questions.map((q, i) => (i === index ? value : q)));
  }

  async function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const readText = (key: string): string => {
      const value = formData.get(key);
      return typeof value === "string" ? value : "";
    };
    const name = readText("name").trim();
    const description = readText("description").trim() || null;
    const systemPrompt = readText("systemPrompt").trim();
    const openingMessage = readText("openingMessage").trim() || null;
    const filteredQuestions = questions.filter((q) => q.trim() !== "");

    if (!name) {
      setError("名称不能为空");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name,
        description,
        systemPrompt,
        openingMessage,
        recommendedQuestions: filteredQuestions,
      });
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
      title={isEdit ? "编辑专家 Agent" : "创建专家 Agent"}
      className="max-w-lg"
      footer={
        <div className="flex justify-end gap-2 pt-2 w-full">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" form="agent-form" loading={submitting}>
            {isEdit ? "保存" : "创建"}
          </Button>
        </div>
      }
    >
      <form
        id="agent-form"
        key={editing?.id ?? "new"}
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p className="text-sm text-danger bg-danger-bg px-3 py-2 rounded-md">{error}</p>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">名称</span>
          <Input
            name="name"
            required
            maxLength={160}
            defaultValue={editing?.name ?? ""}
            placeholder="Agent 名称"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">描述</span>
          <Input
            name="description"
            maxLength={2000}
            defaultValue={editing?.description ?? ""}
            placeholder="简要描述 Agent 的能力"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">系统提示词</span>
          <Textarea
            name="systemPrompt"
            maxLength={8000}
            rows={4}
            defaultValue={editing?.systemPrompt ?? ""}
            placeholder="定义 Agent 的行为和专业领域"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">开场消息</span>
          <Input
            name="openingMessage"
            maxLength={1000}
            defaultValue={editing?.openingMessage ?? ""}
            placeholder="用户开始对话时的欢迎语"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">
            推荐问题({questions.length}/5)
          </span>
          {questions.map((q, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={q}
                onChange={(e) => handleQuestionChange(i, e.target.value)}
                placeholder={`推荐问题 ${String(i + 1)}`}
                maxLength={200}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleRemoveQuestion(i)}
              >
                移除
              </Button>
            </div>
          ))}
          {questions.length < 5 ? (
            <Button type="button" variant="secondary" size="sm" onClick={handleAddQuestion} className="w-fit">
              + 添加推荐问题
            </Button>
          ) : null}
        </div>
      </form>
    </Dialog>
  );
}
