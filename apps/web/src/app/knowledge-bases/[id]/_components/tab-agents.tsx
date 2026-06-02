"use client";

import { useCallback, useEffect, useState } from "react";
import {
  managedAgentListResponseSchema,
  generateManagedAgentResponseSchema,
  type ManagedAgent,
} from "@knowflow/shared";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { Card } from "../../../../components/ui/card";
import { apiRequest, emptyObjectSchema } from "../../../../lib/api";
import { AgentDialog, type AgentFormData } from "./dialogs/agent-dialog";

type TabAgentsProps = {
  knowledgeBaseId: string;
};

const statusTone: Record<string, "neutral" | "success" | "warning" | "info"> = {
  draft: "neutral",
  published: "success",
  disabled: "warning",
  archived: "info",
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  published: "已发布",
  disabled: "已停用",
  archived: "已归档",
};

export function TabAgents({ knowledgeBaseId }: TabAgentsProps) {
  const [agents, setAgents] = useState<ManagedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedAgent | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/agents`,
        managedAgentListResponseSchema,
        { cache: "no-store" },
      );
      setAgents(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [knowledgeBaseId]);

  useEffect(() => { void loadAgents(); }, [loadAgents]);

  async function handleGenerate() {
    setGenerating(true);
    setActionError(null);
    try {
      const response = await apiRequest(
        `/knowledge-bases/${knowledgeBaseId}/agents/generate`,
        generateManagedAgentResponseSchema,
        { method: "POST" },
      );
      await loadAgents();
      // 生成后自动打开编辑 Dialog
      setEditing(response.agent);
      setDialogOpen(true);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function handleCreate(data: AgentFormData) {
    await apiRequest(
      `/knowledge-bases/${knowledgeBaseId}/agents`,
      emptyObjectSchema,
      { method: "POST", body: JSON.stringify(data) },
    );
    await loadAgents();
  }

  async function handleUpdate(data: AgentFormData) {
    if (!editing) return;
    await apiRequest(
      `/agents/${editing.id}`,
      emptyObjectSchema,
      { method: "PATCH", body: JSON.stringify(data) },
    );
    await loadAgents();
  }

  async function handleToggleStatus(agent: ManagedAgent) {
    const newStatus = agent.status === "published" ? "disabled" : "published";
    setActionError(null);
    try {
      await apiRequest(`/agents/${agent.id}`, emptyObjectSchema, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      await loadAgents();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "操作失败");
    }
  }

  async function handleDelete(agentId: string) {
    setActionError(null);
    try {
      await apiRequest(`/agents/${agentId}`, emptyObjectSchema, { method: "DELETE" });
      await loadAgents();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "删除失败");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 一键生成按钮 — 加分项,UI 突出 */}
      <Card className="p-5 border-brand-200 bg-brand-50/30">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-md font-medium text-ink">一键生成专家 Agent</h3>
            <p className="text-sm text-ink-muted mt-0.5">
              基于知识库内容自动生成具有专业知识的 AI 专家
            </p>
          </div>
          <Button loading={generating} onClick={() => void handleGenerate()}>
            ✨ 一键生成
          </Button>
        </div>
      </Card>

      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <h3 className="text-md font-medium text-ink">
          Agent 列表({agents.length})
        </h3>
        <Button variant="secondary" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          手动创建
        </Button>
      </div>

      {actionError ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{actionError}</p>
      ) : null}
      {error ? (
        <p className="rounded-md bg-danger-bg px-3 py-2 text-sm text-danger">{error}</p>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          title="暂无专家 Agent"
          description="点击「一键生成」基于知识库内容自动创建,或手动创建。"
        />
      ) : (
        <div className="grid gap-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-medium text-ink truncate">{agent.name}</h4>
                    <Badge tone={statusTone[agent.status] ?? "neutral"}>
                      {statusLabels[agent.status] ?? agent.status}
                    </Badge>
                  </div>
                  {agent.description ? (
                    <p className="text-xs text-ink-muted mt-1 line-clamp-2">{agent.description}</p>
                  ) : null}
                  {agent.openingMessage ? (
                    <p className="text-xs text-ink-subtle mt-1 italic truncate">
                      「{agent.openingMessage}」
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setEditing(agent); setDialogOpen(true); }}
                  >
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleToggleStatus(agent)}
                  >
                    {agent.status === "published" ? "停用" : "发布"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDelete(agent.id)}
                  >
                    删除
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <AgentDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditing(null); }}
        onSubmit={editing ? handleUpdate : handleCreate}
        editing={editing}
      />
    </div>
  );
}
