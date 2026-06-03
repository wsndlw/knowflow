"use client";

import {
  agentListResponseSchema,
  answerFeedbackRequestSchema,
  askStreamEventSchema,
  conversationListResponseSchema,
  conversationMessagesResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  CSRF_HEADER_NAME,
  type Agent,
  type AskStreamEvent,
  type Citation,
  type ConfidenceLevel,
  type Conversation,
  type ConversationMessage,
  type FeedbackRating,
  type NoAnswerType,
} from "@knowflow/shared";
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import {
  HelpCircle,
  AlertTriangle,
  Compass,
  ShieldAlert,
  AlertCircle,
  FileText,
  ArrowRight,
} from "lucide-react";

import { Button } from "../../components/ui/button";
import { CitationPopover } from "../../components/ui/citation-popover";
import { Dialog } from "../../components/ui/dialog";
import { EmptyState, Skeleton } from "../../components/ui/feedback";
import { apiRequest, apiUrl, getCsrfToken, parseApiError } from "../../lib/api";
import { cn } from "../../lib/cn";

type DraftAssistantMessage = {
  id: string;
  conversationId: string;
  role: "assistant";
  content: string;
  confidenceLevel: ConfidenceLevel | null;
  noAnswerType: NoAnswerType | null;
  citations: Citation[];
  recommendedQuestions: string[];
  relatedDocuments: ConversationMessage["relatedDocuments"];
  createdAt: string;
};

type DisplayMessage = ConversationMessage | DraftAssistantMessage;

const emptyObjectSchema = {
  parse(input: unknown): Record<string, never> {
    if (typeof input === "object" && input !== null && Object.keys(input).length === 0) {
      return {};
    }
    throw new Error("响应格式无效");
  },
};

const confidenceMeta: Record<ConfidenceLevel, { label: string; cls: string }> = {
  strong: { label: "依据充分", cls: "bg-success-bg text-success" },
  medium: { label: "依据一般", cls: "bg-info-bg text-info" },
  weak: { label: "依据不足", cls: "bg-warning-bg text-warning" },
  not_found: { label: "未找到依据", cls: "bg-neutral-100 text-neutral-600" },
};

const noAnswerMeta: Record<
  NoAnswerType,
  {
    label: string;
    description: string;
    bgCls: string;
    textCls: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  no_answer: {
    label: "无匹配答案",
    description: "未在知识库中找到相关内容。",
    bgCls: "bg-neutral-100/80 border border-neutral-200",
    textCls: "text-neutral-700",
    icon: HelpCircle,
  },
  low_confidence: {
    label: "回答可信度较低",
    description: "此回答依据不足，可信度较低，请谨慎参考。",
    bgCls: "bg-warning-bg border border-warning/20",
    textCls: "text-warning",
    icon: AlertTriangle,
  },
  knowledge_gap: {
    label: "知识库空白",
    description: "知识库中尚无相关内容，无法回答该问题。",
    bgCls: "bg-info-bg border border-info/20",
    textCls: "text-info",
    icon: Compass,
  },
  permission_limited: {
    label: "权限受限",
    description: "受权限限制，无法读取与此问题相关的知识库文档。",
    bgCls: "bg-danger-bg border border-danger/20",
    textCls: "text-danger",
    icon: ShieldAlert,
  },
  attachment_parse_failed: {
    label: "附件解析失败",
    description: "上传的附件解析失败，无法提取有效信息进行回答。",
    bgCls: "bg-danger-bg border border-danger/20",
    textCls: "text-danger",
    icon: AlertCircle,
  },
};

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [globalAgentId, setGlobalAgentId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, FeedbackRating>>({});
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);
  // 流式进行中标记:避免 ensureConversation 切换 conversationId 触发 loadMessages 覆盖本地 draft
  const streamingRef = useRef(false);

  // 选全局 AI 助手(type=global);无 Agent 切换
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentResponse, conversationResponse] = await Promise.all([
        apiRequest("/agents", agentListResponseSchema, { cache: "no-store" }),
        apiRequest("/conversations", conversationListResponseSchema, { cache: "no-store" }),
      ]);
      const globalAgent =
        agentResponse.items.find((agent: Agent) => agent.type === "global") ??
        agentResponse.items.find((agent: Agent) => agent.isDefault) ??
        agentResponse.items[0];
      setGlobalAgentId(globalAgent?.id ?? "");
      const globalConversations = conversationResponse.items.filter(
        (c) => c.agentId === globalAgent?.id,
      );
      setConversations(globalConversations);
      setSelectedConversationId(globalConversations[0]?.id ?? "");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载失败");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  const loadMessages = useCallback(async () => {
    if (selectedConversationId === "") {
      setMessages([]);
      return;
    }
    // 流式进行中不重载:否则会用服务器(尚未落库完成)的消息覆盖本地 draft
    if (streamingRef.current) {
      return;
    }
    try {
      const response = await apiRequest(
        `/conversations/${selectedConversationId}/messages`,
        conversationMessagesResponseSchema,
        { cache: "no-store" },
      );
      setMessages(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "加载消息失败");
    }
  }, [selectedConversationId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function refreshConversations(): Promise<Conversation[]> {
    const response = await apiRequest("/conversations", conversationListResponseSchema, {
      cache: "no-store",
    });
    const list = response.items.filter((c) => c.agentId === globalAgentId);
    setConversations(list);
    return list;
  }

  async function ensureConversation(): Promise<string> {
    if (selectedConversationId !== "") {
      return selectedConversationId;
    }
    const input = createConversationRequestSchema.parse({ agentId: globalAgentId });
    const created = await apiRequest("/conversations", conversationSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await refreshConversations();
    setSelectedConversationId(created.id);
    return created.id;
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

  async function ask(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || isAsking || globalAgentId === "") {
      return;
    }
    setIsAsking(true);
    setError(null);
    setQuestion("");
    streamingRef.current = true;
    try {
      const conversationId = await ensureConversation();
      const now = new Date().toISOString();
      const userMessage: DisplayMessage = {
        id: `local-user-${now}`,
        conversationId,
        role: "user",
        content: trimmed,
        confidenceLevel: null,
        noAnswerType: null,
        citations: [],
        recommendedQuestions: [],
        relatedDocuments: [],
        createdAt: now,
      };
      const draft: DraftAssistantMessage = {
        id: `draft-${now}`,
        conversationId,
        role: "assistant",
        content: "",
        confidenceLevel: null,
        noAnswerType: null,
        citations: [],
        recommendedQuestions: [],
        relatedDocuments: [],
        createdAt: now,
      };
      setMessages((current) => [...current, userMessage, draft]);
      await streamAnswer(conversationId, trimmed, draft.id);
      await refreshConversations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提问失败");
    } finally {
      setIsAsking(false);
      setStatusText("");
      streamingRef.current = false;
    }
  }

  async function streamAnswer(conversationId: string, content: string, draftId: string) {
    const response = await fetch(apiUrl(`/conversations/${conversationId}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: getCsrfToken() },
      credentials: "include",
      body: JSON.stringify({ content }),
    });
    if (!response.ok || response.body === null) {
      throw new Error(await parseApiError(response));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result = await reader.read();
    while (!result.done) {
      buffer += decoder.decode(result.value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const event = parseSseEvent(part);
        if (event !== null) {
          handleStreamEvent(event, draftId);
        }
      }
      result = await reader.read();
    }
  }

  function handleStreamEvent(event: AskStreamEvent, draftId: string) {
    switch (event.type) {
      case "agent.step.started": {
        const stepLabels: Record<string, string> = {
          analyze_query: "理解问题中",
          retrieve_knowledge: "检索知识库中",
          rerank_context: "整理相关内容中",
          build_prompt: "组织上下文中",
          generate_answer_stream: "生成回答中",
          attach_citations: "整理引用来源中",
        };
        setStatusText(stepLabels[event.step] ?? "处理中");
        break;
      }
      case "agent.answer.delta":
        setMessages((current) =>
          current.map((m) => (m.id === draftId ? { ...m, content: `${m.content}${event.delta}` } : m)),
        );
        break;
      case "agent.citations.ready":
        setMessages((current) =>
          current.map((m) => (m.id === draftId ? { ...m, citations: event.citations } : m)),
        );
        break;
      case "agent.completed":
        setMessages((current) => current.map((m) => (m.id === draftId ? event.message : m)));
        break;
      case "agent.failed":
        setError(event.message);
        break;
      default:
        break;
    }
  }

  async function sendFeedback(
    messageId: string,
    rating: FeedbackRating,
    extra?: { reason?: string; correctionContent?: string; suggestedSource?: string; suggestedIngestion?: boolean },
  ) {
    setError(null);
    try {
      const payload = answerFeedbackRequestSchema.parse({ rating, ...extra });
      await apiRequest(`/messages/${messageId}/feedback`, emptyObjectSchema, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFeedbackByMessageId((current) => ({ ...current, [messageId]: rating }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "提交反馈失败");
    }
  }

  function regenerate(message: DisplayMessage) {
    // 找到该回答前的用户问题,重新提问
    const idx = messages.findIndex((m) => m.id === message.id);
    for (let i = idx - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "user") {
        void ask(m.content);
        return;
      }
    }
  }

  return (
    <div className="flex h-dvh">
      {/* 左:会话列表 */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-neutral-50">
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-md font-semibold text-ink">AI 对话</h1>
          <Button size="sm" onClick={handleNewConversation}>
            + 新对话
          </Button>
        </div>
        <p className="px-4 pb-2 text-xs text-ink-subtle">全局助手 · 检索你有权访问的全部知识库</p>
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {isLoading ? (
            <div className="flex flex-col gap-1.5 px-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-ink-subtle">还没有对话</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedConversationId(c.id)}
                className={cn(
                  "mb-0.5 block w-full rounded-md px-3 py-2 text-left transition-colors duration-150",
                  c.id === selectedConversationId
                    ? "bg-brand-50 text-brand-700"
                    : "text-ink hover:bg-neutral-100",
                )}
              >
                <span className="line-clamp-1 text-base font-medium">{c.title}</span>
                <span className="text-xs text-ink-subtle">{formatDate(c.updatedAt)}</span>
              </button>
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
                className="mt-16"
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
    </div>
  );
}

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-brand-600 px-4 py-2.5 text-base whitespace-pre-wrap text-white">
        {content}
      </div>
    </div>
  );
}

function AssistantBubble({
  message,
  isStreaming,
  statusText,
  feedback,
  onFeedback,
  onCorrection,
  onRegenerate,
  onAskRecommended,
}: {
  message: DisplayMessage;
  isStreaming: boolean;
  statusText: string;
  feedback: FeedbackRating | undefined;
  onFeedback: (rating: FeedbackRating) => void;
  onCorrection: () => void;
  onRegenerate: () => void;
  onAskRecommended: (q: string) => void;
}) {
  const showSkeleton = isStreaming && message.content === "";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md bg-brand-50 text-xs font-semibold text-brand-700">
          AI
        </span>
        <div className="min-w-0 flex-1">
          {/* noAnswerType 提示 */}
          {!showSkeleton && message.noAnswerType ? (
            (() => {
              const meta = noAnswerMeta[message.noAnswerType];
              const Icon = meta.icon;
              return (
                <div className={cn("mb-3 flex items-start gap-2.5 rounded-lg border p-3 text-sm transition-all shadow-xs", meta.bgCls)}>
                  <Icon className={cn("mt-0.5 size-4 shrink-0", meta.textCls)} />
                  <div className="flex-1">
                    <span className={cn("font-semibold block", meta.textCls)}>
                      {meta.label}
                    </span>
                    <span className="text-ink-muted text-xs mt-0.5 block">
                      {meta.description}
                    </span>
                  </div>
                </div>
              );
            })()
          ) : null}

          {showSkeleton ? (
            <p className="text-sm text-ink-subtle">{statusText || "思考中"}…</p>
          ) : (
            <div className="text-base leading-relaxed whitespace-pre-wrap text-ink">
              {renderWithCitations(message.content, message.citations)}
            </div>
          )}

          {/* 可信度 + 元信息 */}
          {!message.id.startsWith("draft-") ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {message.confidenceLevel !== null ? (
                <span
                  className={cn(
                    "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                    confidenceMeta[message.confidenceLevel].cls,
                  )}
                >
                  {confidenceMeta[message.confidenceLevel].label}
                </span>
              ) : null}
            </div>
          ) : null}

          {/* 相关文档区块 */}
          {!showSkeleton && message.relatedDocuments.length > 0 ? (
            <div className="mt-4 border-t border-dashed border-border pt-3">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted mb-2">
                <FileText className="size-3.5 text-ink-subtle" />
                <span>相关文档</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {message.relatedDocuments.map((doc) => (
                  <a
                    key={doc.id}
                    href={`/knowledge-bases/${doc.knowledgeBaseId}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-border bg-neutral-0 p-2.5 shadow-xs hover:border-brand-300 hover:bg-brand-50/10 transition-all group"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink group-hover:text-brand-700 transition-colors line-clamp-1">
                        {doc.title}
                      </span>
                      {doc.knowledgeBaseName ? (
                        <span className="block text-xs text-ink-subtle mt-0.5 line-clamp-1">
                          知识库: {doc.knowledgeBaseName}
                        </span>
                      ) : null}
                    </div>
                    <ArrowRight className="size-4 shrink-0 self-center text-ink-subtle opacity-0 group-hover:opacity-100 group-hover:text-brand-600 transition-all" />
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          {/* 操作按钮 */}
          {!message.id.startsWith("draft-") ? (
            <div className="mt-2 flex items-center gap-1">
              <IconAction label="复制" onClick={() => void navigator.clipboard.writeText(message.content)} />
              <IconAction label="重新生成" onClick={onRegenerate} />
              <IconAction
                label="赞"
                active={feedback === "useful"}
                disabled={feedback !== undefined}
                onClick={() => onFeedback("useful")}
              />
              <IconAction
                label="踩"
                active={feedback === "not_useful"}
                disabled={feedback !== undefined}
                onClick={() => onFeedback("not_useful")}
              />
              <IconAction label="纠错" onClick={onCorrection} />
              {feedback !== undefined ? (
                <span className="ml-1 text-xs text-ink-subtle">已反馈</span>
              ) : null}
            </div>
          ) : null}

          {/* 推荐问题 */}
          {message.recommendedQuestions.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {message.recommendedQuestions.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => onAskRecommended(q)}
                  className="rounded-full border border-border bg-neutral-0 px-3 py-1 text-sm text-ink-muted transition-colors hover:border-brand-300 hover:text-brand-700"
                >
                  {q}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// 回答正文里的 [n] 标号渲染成带悬停来源卡片的引用(卡片可点击跳转)
function renderWithCitations(content: string, citations: Citation[]) {
  if (citations.length === 0) {
    return content;
  }
  const parts = content.split(/(\[\d+\])/g);
  return parts.map((part, idx) => {
    const match = /^\[(\d+)\]$/.exec(part);
    if (match !== null) {
      const n = Number(match[1]);
      const citation = citations[n - 1];
      if (citation !== undefined) {
        return (
          <CitationPopover
            key={idx}
            data={{
              index: n,
              title: citation.title,
              knowledgeBaseName: citation.knowledgeBaseName,
              snippet: citation.snippet,
              pageOrSection: citation.pageOrSection,
              href:
                citation.knowledgeBaseId !== null
                  ? `/knowledge-bases/${citation.knowledgeBaseId}`
                  : null,
            }}
          />
        );
      }
    }
    return <span key={idx}>{part}</span>;
  });
}

function IconAction({
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-2 py-1 text-xs transition-colors duration-150",
        active ? "bg-brand-50 text-brand-700" : "text-ink-subtle hover:bg-neutral-100 hover:text-ink",
        disabled && !active ? "cursor-not-allowed opacity-50" : "",
      )}
    >
      {label}
    </button>
  );
}

function CorrectionDialog({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    reason?: string;
    correctionContent: string;
    suggestedSource?: string;
    suggestedIngestion?: boolean;
  }) => void;
}) {
  const [correction, setCorrection] = useState("");
  const [source, setSource] = useState("");
  const [ingestion, setIngestion] = useState(false);

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (correction.trim() === "") {
      return;
    }
    const trimmedSource = source.trim();
    onSubmit({
      correctionContent: correction.trim(),
      ...(trimmedSource === "" ? {} : { suggestedSource: trimmedSource }),
      suggestedIngestion: ingestion,
    });
    setCorrection("");
    setSource("");
    setIngestion(false);
  }

  return (
    <Dialog open={open} onClose={onClose} title="纠错反馈" description="帮助我们改进答案质量。">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">正确答案是什么</span>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            required
            placeholder="请填写你认为正确的答案"
            className="w-full resize-y rounded-md border border-border bg-neutral-0 px-3 py-2 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">应该引用哪份资料(可选)</span>
          <input
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="资料名称或位置"
            className="h-9.5 w-full rounded-md border border-border bg-neutral-0 px-3 text-base text-ink placeholder:text-ink-subtle focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
          />
        </label>
        <label className="flex items-center gap-2 text-base text-ink">
          <input
            type="checkbox"
            checked={ingestion}
            onChange={(e) => setIngestion(e.target.checked)}
            className="size-4 rounded border-border text-brand-600 focus:ring-brand-500/20"
          />
          建议补充到知识库
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button type="submit" disabled={correction.trim() === ""}>
            提交纠错
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function parseSseEvent(chunk: string): AskStreamEvent | null {
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
  if (dataLine === undefined) {
    return null;
  }
  const parsed: unknown = JSON.parse(dataLine.slice(6));
  return askStreamEventSchema.parse(parsed);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
