"use client";

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { Archive, RotateCcw } from "lucide-react";
import {
  agentListResponseSchema,
  conversationListResponseSchema,
  conversationSchema,
  type Agent,
  type Conversation,
} from "@knowflow/shared";

import { Button } from "../../components/ui/button";
import { EmptyState, Skeleton } from "../../components/ui/feedback";
import { AssistantBubble, UserBubble, CorrectionDialog } from "../_components/chat-bubbles";
import { useAgentChat } from "../_hooks/use-agent-chat";
import { apiRequest } from "../../lib/api";
import { cn } from "../../lib/cn";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [globalAgentId, setGlobalAgentId] = useState("");
  const [conversationView, setConversationView] = useState<"active" | "archived">("active");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; tone: "success" | "danger" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const showToast = useCallback((message: string, tone: "success" | "danger" = "success") => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  const refreshConversations = useCallback(async (status: "active" | "archived") => {
    if (globalAgentId === "") return [];
    try {
      const response = await apiRequest(`/conversations?status=${status}`, conversationListResponseSchema, {
        cache: "no-store",
      });
      const list = response.items.filter((c) => c.agentId === globalAgentId);
      setConversations(list);
      return list;
    } catch {
      return [];
    }
  }, [globalAgentId]);

  const {
    selectedConversationId,
    setSelectedConversationId,
    messages,
    setMessages,
    question,
    setQuestion,
    statusText,
    error,
    setError,
    isAsking,
    feedbackByMessageId,
    correctionFor,
    setCorrectionFor,
    listEndRef,
    ask,
    sendFeedback,
    regenerate,
  } = useAgentChat({
    agentId: globalAgentId,
    onConversationCreated: () => {
      if (conversationView === "archived") {
        setConversationView("active");
      } else {
        void refreshConversations("active");
      }
    },
    onStreamCompleted: () => {
      void refreshConversations("active");
    }
  });

  const [isLoading, setIsLoading] = useState(true);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const agentResponse = await apiRequest("/agents", agentListResponseSchema, { cache: "no-store" });
      const globalAgent =
        agentResponse.items.find((agent: Agent) => agent.type === "global") ??
        agentResponse.items.find((agent: Agent) => agent.isDefault) ??
        agentResponse.items[0];
      const newAgentId = globalAgent?.id ?? "";
      setGlobalAgentId(newAgentId);
      if (newAgentId === "") {
        setIsLoading(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (globalAgentId !== "") {
      setIsLoading(true);
      void refreshConversations(conversationView).finally(() => setIsLoading(false));
    }
  }, [conversationView, globalAgentId, refreshConversations]);

  async function handleArchive(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (processingId !== null) return;
    setProcessingId(id);
    try {
      await apiRequest(`/conversations/${id}/archive`, conversationSchema, { method: "POST" });
      if (selectedConversationId === id) {
        setSelectedConversationId("");
        setMessages([]);
      }
      await refreshConversations(conversationView);
      showToast("会话已归档");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "归档失败", "danger");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleRestore(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (processingId !== null) return;
    setProcessingId(id);
    try {
      await apiRequest(`/conversations/${id}/restore`, conversationSchema, { method: "POST" });
      await refreshConversations(conversationView);
      showToast("会话已恢复");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "恢复失败", "danger");
    } finally {
      setProcessingId(null);
    }
  }

  function handleNewConversation() {
    setSelectedConversationId("");
    setMessages([]);
    setError(null);
  }

  async function handleAsk(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    await ask(question);
  }

  return (
    <div className="flex h-full">
      {/* 左:会话列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-neutral-50">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-md font-semibold text-ink">AI 对话</h1>
          <Button size="sm" onClick={handleNewConversation}>
            + 新对话
          </Button>
        </div>
        <p className="px-4 pb-2 text-xs text-ink-subtle">全局助手 · 检索你有权访问的全部知识库</p>

        {/* 视图切换 */}
        <div className="px-4 pb-2">
          <div className="flex rounded-md bg-neutral-200/50 p-0.5">
            <button
              type="button"
              onClick={() => {
                setConversationView("active");
                setSelectedConversationId("");
              }}
              className={cn(
                "flex-1 rounded text-xs font-medium py-1 text-center transition-colors",
                conversationView === "active" ? "bg-white text-ink shadow-sm" : "text-ink-subtle hover:text-ink"
              )}
            >
              进行中
            </button>
            <button
              type="button"
              onClick={() => {
                setConversationView("archived");
                setSelectedConversationId("");
              }}
              className={cn(
                "flex-1 rounded text-xs font-medium py-1 text-center transition-colors",
                conversationView === "archived" ? "bg-white text-ink shadow-sm" : "text-ink-subtle hover:text-ink"
              )}
            >
              已归档
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1">
          {isLoading ? (
            <div className="flex flex-col gap-1.5 px-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-subtle">
              {conversationView === "active" ? "还没有对话" : "没有已归档对话"}
            </p>
          ) : (
            conversations.map((c) => (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedConversationId(c.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedConversationId(c.id);
                  }
                }}
                className={cn(
                  "group mb-0.5 flex w-full flex-col items-start rounded-md px-3 py-2 text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  c.id === selectedConversationId
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink hover:bg-neutral-100",
                )}
              >
                <div className="flex w-full items-center justify-between">
                  <span className="line-clamp-1 text-base font-medium flex-1 mr-2">{c.title}</span>
                  {conversationView === "active" ? (
                    <button
                      type="button"
                      title="归档"
                      disabled={processingId !== null}
                      onClick={(e) => void handleArchive(e, c.id)}
                      className={cn(
                        "opacity-0 transition-opacity p-1 rounded-sm group-hover:opacity-100 hover:bg-neutral-200/60 disabled:opacity-50 disabled:cursor-not-allowed",
                        c.id === selectedConversationId ? "hover:bg-brand-100" : ""
                      )}
                    >
                      <Archive className={cn("size-3.5", processingId === c.id ? "animate-pulse" : "")} />
                    </button>
                  ) : (
                    <button
                      type="button"
                      title="恢复"
                      disabled={processingId !== null}
                      onClick={(e) => void handleRestore(e, c.id)}
                      className={cn(
                        "opacity-0 transition-opacity p-1 rounded-sm group-hover:opacity-100 hover:bg-neutral-200/60 disabled:opacity-50 disabled:cursor-not-allowed",
                        c.id === selectedConversationId ? "hover:bg-brand-100" : ""
                      )}
                    >
                      <RotateCcw className={cn("size-3.5", processingId === c.id ? "animate-spin" : "")} />
                    </button>
                  )}
                </div>
                <span className="text-xs text-ink-subtle">{formatDate(c.updatedAt)}</span>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* 右:对话流 */}
      <main className="flex min-w-0 flex-1 flex-col bg-background">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
            {error !== null ? (
              <p className="rounded-md bg-danger-bg px-4 py-3 text-sm text-danger" role="alert">
                {error}
              </p>
            ) : null}

            {!isLoading && messages.length === 0 ? (
              <EmptyState
                title="开始一段对话"
                description="向全局助手提问,它会在你有权访问的全部知识库中查找依据并给出带来源的回答。"
                className="mt-[18vh]"
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
              ),
            )}
            <div ref={listEndRef} />
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-border bg-surface px-6 py-4">
          <form
            className="mx-auto flex max-w-3xl items-end gap-2"
            onSubmit={(event) => void handleAsk(event)}
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
              disabled={globalAgentId === ""}
              className="max-h-40 min-h-11 flex-1 resize-none rounded-lg border border-border bg-neutral-0 px-3 py-2.5 text-base text-ink placeholder:text-ink-subtle hover:border-neutral-300 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:bg-neutral-100"
            />
            <Button
              type="submit"
              size="lg"
              loading={isAsking}
              disabled={globalAgentId === "" || question.trim() === ""}
            >
              发送
            </Button>
          </form>
        </div>
      </main>

      {/* 纠错 Dialog */}
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

      {/* Toast */}
      {toast ? (
        <div
          className={cn(
            "fixed top-6 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg z-[var(--z-toast,9999)]",
            toast.tone === "success" ? "bg-success" : "bg-danger"
          )}
          role="status"
        >
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}



function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
