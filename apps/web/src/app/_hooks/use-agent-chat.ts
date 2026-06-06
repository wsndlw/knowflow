import { useCallback, useEffect, useRef, useState } from "react";
import {
  answerFeedbackRequestSchema,
  askStreamEventSchema,
  conversationMessagesResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  CSRF_HEADER_NAME,
  type AskStreamEvent,
  type FeedbackRating,
} from "@knowflow/shared";
import { apiRequest, apiUrl, getCsrfToken, parseApiError } from "../../lib/api";
import { type DisplayMessage, type DraftAssistantMessage } from "../_components/chat-bubbles";

const emptyObjectSchema = {
  parse(input: unknown): Record<string, never> {
    if (typeof input === "object" && input !== null && Object.keys(input).length === 0) {
      return {};
    }
    throw new Error("响应格式无效");
  },
};

export function parseSseEvent(chunk: string): AskStreamEvent | null {
  const dataLine = chunk.split("\n").find((line) => line.startsWith("data: "));
  if (dataLine === undefined) {
    return null;
  }
  const parsed: unknown = JSON.parse(dataLine.slice(6));
  return askStreamEventSchema.parse(parsed);
}

export function useAgentChat({
  agentId,
  initialConversationId = "",
  onConversationCreated,
  onStreamCompleted,
}: {
  agentId: string;
  initialConversationId?: string;
  onConversationCreated?: (id: string) => void;
  onStreamCompleted?: () => void;
}) {
  const [selectedConversationId, setSelectedConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, FeedbackRating>>({});
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  
  const listEndRef = useRef<HTMLDivElement>(null);
  const streamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [agentId]);

  // Auto-scroll when messages change —— 只滚动对话消息容器自身，
  // 不能用 listEndRef.scrollIntoView：它会滚动所有可滚动祖先(含外层 main)，
  // 表现为「整个布局在动」，且滚动位置残留会被常驻 main 带到其他页。
  useEffect(() => {
    const end = listEndRef.current;
    if (end === null) {
      return;
    }
    // 找到最近的可滚动祖先(对话消息区 overflow-y-auto)，只滚它到底部。
    let container: HTMLElement | null = end.parentElement;
    while (container !== null) {
      const style = window.getComputedStyle(container);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        break;
      }
      container = container.parentElement;
    }
    if (container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const loadMessages = useCallback(async () => {
    if (selectedConversationId === "") {
      setMessages([]);
      return;
    }
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

  async function ensureConversation(): Promise<string> {
    if (selectedConversationId !== "") {
      return selectedConversationId;
    }
    const input = createConversationRequestSchema.parse({ agentId });
    const created = await apiRequest("/conversations", conversationSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
    setSelectedConversationId(created.id);
    onConversationCreated?.(created.id);
    return created.id;
  }

  async function ask(raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "" || isAsking || agentId === "") {
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
        createdAt: now,
      };
      setMessages((current) => [...current, userMessage, draft]);
      abortControllerRef.current = new AbortController();
      await streamAnswer(conversationId, trimmed, draft.id, abortControllerRef.current.signal);
      onStreamCompleted?.();
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        return;
      }
      setError(caught instanceof Error ? caught.message : "提问失败");
    } finally {
      setIsAsking(false);
      setStatusText("");
      streamingRef.current = false;
      abortControllerRef.current = null;
    }
  }

  async function streamAnswer(conversationId: string, content: string, draftId: string, signal: AbortSignal) {
    const response = await fetch(apiUrl(`/conversations/${conversationId}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: getCsrfToken() },
      credentials: "include",
      body: JSON.stringify({ content }),
      signal,
    });
    if (!response.ok || response.body === null) {
      throw new Error(await parseApiError(response));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      let result = await reader.read();
      while (!result.done) {
        if (signal.aborted) {
          await reader.cancel();
          break;
        }
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
    } finally {
      if (signal.aborted) {
        await reader.cancel();
      }
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
    const idx = messages.findIndex((m) => m.id === message.id);
    for (let i = idx - 1; i >= 0; i -= 1) {
      const m = messages[i];
      if (m?.role === "user") {
        void ask(m.content);
        return;
      }
    }
  }

  return {
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
  };
}
