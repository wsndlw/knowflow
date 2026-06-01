"use client";

import {
  agentListResponseSchema,
  answerFeedbackRequestSchema,
  askStreamEventSchema,
  conversationListResponseSchema,
  conversationMessagesResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  type Agent,
  type AskStreamEvent,
  type Citation,
  type ConfidenceLevel,
  type Conversation,
  type ConversationMessage,
  type FeedbackRating,
} from "@knowflow/shared";
import { useCallback, useEffect, useMemo, useState, type SyntheticEvent } from "react";

import { apiRequest, apiUrl, parseApiError } from "../../lib/api";

type DraftAssistantMessage = {
  id: string;
  conversationId: string;
  role: "assistant";
  content: string;
  confidenceLevel: ConfidenceLevel | null;
  noAnswerType: string | null;
  citations: Citation[];
  createdAt: string;
};

type DisplayMessage = ConversationMessage | DraftAssistantMessage;

const emptyObjectSchema = {
  parse(input: unknown): Record<string, never> {
    if (typeof input === "object" && input !== null && Object.keys(input).length === 0) {
      return {};
    }
    throw new Error("Invalid API response");
  },
};

const confidenceLabels: Record<ConfidenceLevel, string> = {
  strong: "Strong evidence",
  medium: "Moderate evidence",
  weak: "Limited evidence",
  not_found: "No evidence",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [statusText, setStatusText] = useState("Loading agents...");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAsking, setIsAsking] = useState(false);
  const [feedbackByMessageId, setFeedbackByMessageId] = useState<Record<string, FeedbackRating>>({});

  const selectedAgent = agents.find((item) => item.id === selectedAgentId);

  const loadConversations = useCallback(async () => {
    const response = await apiRequest("/conversations", conversationListResponseSchema, {
      cache: "no-store",
    });
    setConversations(response.items);
    setSelectedConversationId((current) =>
      current !== "" ? current : (response.items[0]?.id ?? ""),
    );
  }, []);

  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [agentResponse, conversationResponse] = await Promise.all([
        apiRequest("/agents", agentListResponseSchema, { cache: "no-store" }),
        apiRequest("/conversations", conversationListResponseSchema, { cache: "no-store" }),
      ]);
      setAgents(agentResponse.items);
      const defaultAgent =
        agentResponse.items.find((agent) => agent.isDefault) ?? agentResponse.items[0];
      setSelectedAgentId(defaultAgent?.id ?? "");
      setConversations(conversationResponse.items);
      setSelectedConversationId(conversationResponse.items[0]?.id ?? "");
      setStatusText(agentResponse.items.length === 0 ? "No available agents." : "Ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load agents");
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
    try {
      const response = await apiRequest(
        `/conversations/${selectedConversationId}/messages`,
        conversationMessagesResponseSchema,
        { cache: "no-store" },
      );
      setMessages(response.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load messages");
    }
  }, [selectedConversationId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const conversationsForAgent = useMemo(
    () => conversations.filter((conversation) => conversation.agentId === selectedAgentId),
    [conversations, selectedAgentId],
  );

  async function ensureConversation(): Promise<string> {
    if (selectedConversationId !== "") {
      return selectedConversationId;
    }
    if (selectedAgentId === "") {
      throw new Error("Select an agent first");
    }

    const input = createConversationRequestSchema.parse({ agentId: selectedAgentId });
    const created = await apiRequest("/conversations", conversationSchema, {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadConversations();
    setSelectedConversationId(created.id);
    return created.id;
  }

  async function handleNewConversation() {
    if (selectedAgentId === "") {
      return;
    }
    setError(null);
    try {
      const input = createConversationRequestSchema.parse({ agentId: selectedAgentId });
      const created = await apiRequest("/conversations", conversationSchema, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setConversations((current) => [created, ...current]);
      setSelectedConversationId(created.id);
      setMessages([]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to create conversation");
    }
  }

  async function handleAsk(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed === "" || isAsking) {
      return;
    }

    setIsAsking(true);
    setError(null);
    setQuestion("");
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
        createdAt: now,
      };
      setMessages((current) => [...current, userMessage, draft]);
      await streamAnswer(conversationId, trimmed, draft.id);
      await loadConversations();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to ask question");
    } finally {
      setIsAsking(false);
      setStatusText("Ready");
    }
  }

  async function streamAnswer(conversationId: string, content: string, draftId: string) {
    const response = await fetch(apiUrl(`/conversations/${conversationId}/messages`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      case "agent.step.started":
        setStatusText(`${event.step.replaceAll("_", " ")}...`);
        break;
      case "agent.retrieval.completed":
        setStatusText(`Retrieved ${String(event.contextCount)} context item(s).`);
        break;
      case "agent.answer.delta":
        setMessages((current) =>
          current.map((message) =>
            message.id === draftId
              ? { ...message, content: `${message.content}${event.delta}` }
              : message,
          ),
        );
        break;
      case "agent.citations.ready":
        setMessages((current) =>
          current.map((message) =>
            message.id === draftId ? { ...message, citations: event.citations } : message,
          ),
        );
        break;
      case "agent.completed":
        setMessages((current) =>
          current.map((message) => (message.id === draftId ? event.message : message)),
        );
        break;
      case "agent.failed":
        setError(event.message);
        break;
      case "agent.started":
      case "agent.step.completed":
        break;
    }
  }

  async function sendFeedback(messageId: string, rating: FeedbackRating) {
    setError(null);
    try {
      const payload = answerFeedbackRequestSchema.parse({ rating });
      await apiRequest(`/messages/${messageId}/feedback`, emptyObjectSchema, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setFeedbackByMessageId((current) => ({ ...current, [messageId]: rating }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to submit feedback");
    }
  }

  return (
    <section className="page-stack">
      <div className="page-heading page-heading-row">
        <div>
          <p className="eyebrow">Knowledge consumption</p>
          <h1>Expert Agents</h1>
        </div>
        <button
          className="action-button secondary"
          type="button"
          disabled={selectedAgentId === ""}
          onClick={() => void handleNewConversation()}
        >
          New conversation
        </button>
      </div>

      {error !== null && <div className="form-error">{error}</div>}
      {isLoading && <div className="empty-state">Loading agents...</div>}

      {!isLoading && (
        <div className="chat-layout">
          <aside className="chat-sidebar">
            <label>
              Agent
              <select
                value={selectedAgentId}
                onChange={(event) => {
                  setSelectedAgentId(event.target.value);
                  const next = conversations.find(
                    (conversation) => conversation.agentId === event.target.value,
                  );
                  setSelectedConversationId(next?.id ?? "");
                }}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="agent-summary">
              <strong>{selectedAgent?.name ?? "No agent"}</strong>
              <span>{selectedAgent?.description ?? "No description"}</span>
            </div>

            <div className="conversation-list">
              {conversationsForAgent.length === 0 && (
                <div className="empty-state compact">No conversations for this agent.</div>
              )}
              {conversationsForAgent.map((conversation) => (
                <button
                  key={conversation.id}
                  className={
                    conversation.id === selectedConversationId
                      ? "conversation-item active"
                      : "conversation-item"
                  }
                  type="button"
                  onClick={() => setSelectedConversationId(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>{formatDate(conversation.updatedAt)}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="chat-main">
            <div className="chat-status">{statusText}</div>
            <div className="message-list">
              {messages.length === 0 && (
                <div className="empty-state">
                  Ask a question based on knowledge you are allowed to access.
                </div>
              )}
              {messages.map((message) => (
                <article key={message.id} className={`message-bubble ${message.role}`}>
                  <div className="message-role">{message.role === "user" ? "You" : "Assistant"}</div>
                  <p>{message.content || (isAsking ? "..." : "")}</p>
                  {message.role === "assistant" && (
                    <AssistantMeta
                      message={message}
                      feedback={feedbackByMessageId[message.id]}
                      onFeedback={(rating) => void sendFeedback(message.id, rating)}
                    />
                  )}
                </article>
              ))}
            </div>

            <form className="chat-input" onSubmit={(event) => void handleAsk(event)}>
              <textarea
                aria-label="Question"
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder="Ask about policy, process, or uploaded knowledge..."
                rows={3}
              />
              <button
                className="action-button"
                type="submit"
                disabled={isAsking || selectedAgentId === "" || question.trim() === ""}
              >
                {isAsking ? "Answering..." : "Send"}
              </button>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}

function AssistantMeta({
  message,
  feedback,
  onFeedback,
}: {
  message: DisplayMessage;
  feedback: FeedbackRating | undefined;
  onFeedback: (rating: FeedbackRating) => void;
}) {
  return (
    <div className="assistant-meta">
      {message.confidenceLevel !== null && (
        <span className={`confidence ${message.confidenceLevel}`}>
          {confidenceLabels[message.confidenceLevel]}
        </span>
      )}
      {message.noAnswerType !== null && <span className="no-answer">{message.noAnswerType}</span>}

      {message.citations.length > 0 && (
        <div className="citation-list">
          {message.citations.map((citation, index) => (
            <div
              key={`${citation.sourceType}-${String(citation.documentId ?? citation.knowledgeItemId ?? index)}`}
              className="citation-card"
            >
              <strong>
                [{String(index + 1)}] {citation.title}
              </strong>
              <span>{citation.sourceType}</span>
              {citation.pageOrSection !== null && <small>{citation.pageOrSection}</small>}
              {citation.snippet !== null && <p>{citation.snippet}</p>}
            </div>
          ))}
        </div>
      )}

      {!message.id.startsWith("draft-") && (
        <div className="feedback-actions">
          <button
            className="action-button secondary"
            type="button"
            disabled={feedback !== undefined}
            onClick={() => onFeedback("useful")}
          >
            Useful
          </button>
          <button
            className="action-button secondary"
            type="button"
            disabled={feedback !== undefined}
            onClick={() => onFeedback("not_useful")}
          >
            Not useful
          </button>
          {feedback !== undefined && <span>Feedback: {feedback}</span>}
        </div>
      )}
    </div>
  );
}

function parseSseEvent(chunk: string): AskStreamEvent | null {
  const dataLine = chunk
    .split("\n")
    .find((line) => line.startsWith("data: "));
  if (dataLine === undefined) {
    return null;
  }
  const parsed: unknown = JSON.parse(dataLine.slice(6));
  return askStreamEventSchema.parse(parsed);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
