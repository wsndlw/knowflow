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
import { apiRequest, apiUrl, getCsrfToken, parseApiError, refreshAccess } from "../../lib/api";
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
  const [selectedConversationId, setSelectedConversationIdState] = useState(initialConversationId);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, FeedbackRating>>({});
  const [correctionFor, setCorrectionFor] = useState<string | null>(null);
  
  const listEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLenRef = useRef(0);
  const streamingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  // 始终指向「当前选中会话」与「在途流所属会话」，供流事件归属校验与切换中断使用
  const selectedConversationIdRef = useRef(selectedConversationId);
  selectedConversationIdRef.current = selectedConversationId;
  const streamConversationIdRef = useRef<string | null>(null);

  // 中断在途流（切换/清空会话、切 Agent、卸载时）：清空状态以便新会话加载
  const abortInFlightStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    streamingRef.current = false;
    streamConversationIdRef.current = null;
    setIsAsking(false);
    setStatusText("");
  }, []);

  // 包装会话切换：切到「非在途流所属」的会话时中断旧流，避免旧流串台写入新会话
  const setSelectedConversationId = useCallback(
    (id: string) => {
      if (streamingRef.current && streamConversationIdRef.current !== id) {
        abortInFlightStream();
      }
      selectedConversationIdRef.current = id;
      setSelectedConversationIdState(id);
    },
    [abortInFlightStream],
  );

  useEffect(() => {
    return () => {
      abortInFlightStream();
    };
  }, [agentId, abortInFlightStream]);

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
    if (container === null) {
      return;
    }
    // 新消息总是吸底；流式增量时仅当用户已贴近底部才吸底，避免打断上滑查看历史
    const isNewMessage = messages.length > prevMessagesLenRef.current;
    prevMessagesLenRef.current = messages.length;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (isNewMessage || distanceFromBottom < 120) {
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
    selectedConversationIdRef.current = created.id;
    setSelectedConversationIdState(created.id);
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const conversationId = await ensureConversation();
      const now = new Date().toISOString();
      const localId = crypto.randomUUID();
      const userMessage: DisplayMessage = {
        id: `local-user-${localId}`,
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
        id: `draft-${localId}`,
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
      streamConversationIdRef.current = conversationId;
      await streamAnswer(conversationId, trimmed, draft.id, controller.signal);
      onStreamCompleted?.();
    } catch (caught) {
      if (caught instanceof Error && caught.name === "AbortError") {
        return;
      }
      setError(caught instanceof Error ? caught.message : "提问失败");
    } finally {
      // 仅当 abortController 仍是本次创建的那个时才复位（切换/新流会替换它，旧流 finally 不误清）
      if (abortControllerRef.current === controller) {
        setIsAsking(false);
        setStatusText("");
        streamingRef.current = false;
        abortControllerRef.current = null;
        streamConversationIdRef.current = null;
      }
    }
  }

  async function streamAnswer(conversationId: string, content: string, draftId: string, signal: AbortSignal) {
    const doFetch = () =>
      fetch(apiUrl(`/conversations/${conversationId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json", [CSRF_HEADER_NAME]: getCsrfToken() },
        credentials: "include",
        body: JSON.stringify({ content }),
        signal,
      });
    let response = await doFetch();
    // 流式走裸 fetch（绕过 apiRequest），需自行处理 401：刷新后重试一次，仍失败则跳登录
    if (response.status === 401) {
      const refreshed = await refreshAccess();
      if (!refreshed) {
        if (typeof window !== "undefined" && window.location.pathname !== "/login") {
          window.location.href = "/login";
        }
        throw new Error("登录状态已失效，请重新登录");
      }
      response = await doFetch();
    }
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
            handleStreamEvent(event, draftId, conversationId);
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

  function handleStreamEvent(event: AskStreamEvent, draftId: string, streamConversationId: string) {
    // 归属校验：仅当流仍属于当前选中会话时才写入，防止切走后旧流串台
    if (selectedConversationIdRef.current !== streamConversationId) {
      return;
    }
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
        // 移除空白 draft，避免流结束后残留空气泡；错误提示统一在顶部展示
        setMessages((current) => current.filter((m) => m.id !== draftId));
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
