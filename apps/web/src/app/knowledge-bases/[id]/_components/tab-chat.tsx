"use client";

import { useEffect, useState } from "react";
import { agentListResponseSchema, type Agent } from "@knowflow/shared";
import { apiRequest } from "../../../../lib/api";
import { Button } from "../../../../components/ui/button";
import { EmptyState, Skeleton } from "../../../../components/ui/feedback";
import { useAgentChat } from "../../../_hooks/use-agent-chat";
import { AssistantBubble, UserBubble, CorrectionDialog } from "../../../_components/chat-bubbles";

export function TabChat({ knowledgeBaseId }: { knowledgeBaseId: string }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await apiRequest(`/agents?knowledgeBaseId=${knowledgeBaseId}`, agentListResponseSchema, {
          cache: "no-store",
        });
        setAgents(response.items);
        if (response.items.length > 0) {
          const defaultAgent = response.items.find((a: Agent) => a.isDefault) ?? response.items[0];
          if (defaultAgent) {
            setSelectedAgentId(defaultAgent.id);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载专家 Agent 失败");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [knowledgeBaseId]);

  const {
    messages,
    question,
    setQuestion,
    statusText,
    error: chatError,
    isAsking,
    feedbackByMessageId,
    correctionFor,
    setCorrectionFor,
    listEndRef,
    ask,
    sendFeedback,
    regenerate,
    setSelectedConversationId,
    setMessages,
  } = useAgentChat({
    agentId: selectedAgentId,
  });

  // When agent changes, clear messages and conversation so it starts a new one
  useEffect(() => {
    setSelectedConversationId("");
    setMessages([]);
  }, [selectedAgentId, setSelectedConversationId, setMessages]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (error) {
    return <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger">{error}</p>;
  }

  if (agents.length === 0) {
    return (
      <EmptyState
        title="该知识库暂无可用专家 Agent"
        description="请联系管理员在「专家 Agent」标签页创建并发布。"
      />
    );
  }

  return (
    <div className="flex h-[600px] flex-col rounded-lg border border-border bg-background shadow-sm">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <h3 className="font-medium text-ink">对话</h3>
        {agents.length > 1 && (
          <select
            value={selectedAgentId}
            onChange={(e) => setSelectedAgentId(e.target.value)}
            className="rounded-md border border-border bg-neutral-0 px-2 py-1 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-6">
          {chatError && (
            <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
              {chatError}
            </p>
          )}

          {messages.length === 0 ? (
            <EmptyState
              title="开始提问"
              description="该专家 Agent 熟知本知识库内容，向它提问吧。"
            />
          ) : null}

          {messages.map((message) =>
            message.role === "user" ? (
              <UserBubble key={message.id} content={message.content} />
            ) : (
              <AssistantBubble
                key={message.id}
                message={message}
                isStreaming={message.id.startsWith("draft-") && isAsking}
                statusText={statusText}
                feedback={feedbackByMessageId[message.id]}
                onFeedback={(rating) => void sendFeedback(message.id, rating)}
                onCorrection={() => setCorrectionFor(message.id)}
                onRegenerate={() => regenerate(message)}
                onAskRecommended={(q) => void ask(q)}
              />
            )
          )}
          <div ref={listEndRef} />
        </div>
      </div>

      <div className="border-t border-border bg-surface px-6 py-4">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void ask(question);
          }}
        >
          <textarea
            aria-label="输入问题"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask(question);
              }
            }}
            placeholder="输入问题,Enter 发送,Shift+Enter 换行…"
            rows={2}
            disabled={selectedAgentId === ""}
            className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-border bg-neutral-0 px-3 py-2.5 text-base text-ink placeholder:text-ink-subtle hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
          />
          <Button
            type="submit"
            size="lg"
            loading={isAsking}
            disabled={selectedAgentId === "" || question.trim() === ""}
          >
            发送
          </Button>
        </form>
      </div>

      <CorrectionDialog
        open={correctionFor !== null}
        onClose={() => setCorrectionFor(null)}
        onSubmit={(data) => {
          if (correctionFor !== null) {
            void sendFeedback(correctionFor, "correction", data);
            setCorrectionFor(null);
          }
        }}
      />
    </div>
  );
}
