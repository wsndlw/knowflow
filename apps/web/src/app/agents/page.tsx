"use client";

import { useCallback, useEffect, useState } from "react";
import {
  agentListResponseSchema,
  conversationListResponseSchema,
  type Agent,
  type Conversation,
} from "@knowflow/shared";

import { useAgentChat } from "../_hooks/use-agent-chat";
import { apiRequest } from "../../lib/api";
import { AgentChatLayout } from "../_components/agent-chat-layout";

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [globalAgentId, setGlobalAgentId] = useState("");
  const [conversationView, setConversationView] = useState<"active" | "archived">("active");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const chatHook = useAgentChat({
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

  return (
    <AgentChatLayout
      disableInput={globalAgentId === ""}
      isLoading={isLoading}
      error={error ?? chatHook.error}
      conversations={conversations}
      conversationView={conversationView}
      setConversationView={setConversationView}
      onRefreshConversations={refreshConversations}
      headerTitle="AI 对话"
      headerSubtitle="全局助手 · 检索你有权访问的全部知识库"
      showArchive={true}
      emptyStateTitle="开始一段对话"
      emptyStateDescription="向全局助手提问,它会在你有权访问的全部知识库中查找依据并给出带来源的回答。"
      chatHook={chatHook}
    />
  );
}
