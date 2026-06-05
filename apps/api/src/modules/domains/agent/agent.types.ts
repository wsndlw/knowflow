import type {
  Agent,
  AskStreamEvent,
  Citation,
  ConfidenceLevel,
  Conversation,
  ConversationMessage,
  NoAnswerType,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { RetrievalResult } from "../retrieval/retrieval.types.js";
import type { AccessibleKnowledgeBase } from "./agent-scope.js";
import type { RecentConversationMessage } from "./agent-memory.js";

export type SseEmitter = (event: AskStreamEvent) => Promise<void>;

export type RuntimeAgent = Agent & {
  systemPrompt: string | null;
};

export type AgentState = {
  user: AuthenticatedUser;
  conversation: Conversation;
  userMessageId: string;
  query: string;
  agent: RuntimeAgent | null;
  knowledgeScope: string[];
  accessibleKnowledgeBases: AccessibleKnowledgeBase[];
  recentMessages: RecentConversationMessage[];
  conversationSummary: string | null;
  rewrittenQueries: string[];
  retrieval: RetrievalResult | null;
  promptSnapshot: string | null;
  answer: string;
  citations: Citation[];
  confidenceLevel: ConfidenceLevel | null;
  noAnswerType: NoAnswerType | null;
  assistantMessage: ConversationMessage | null;
  steps: { name: string; status: "started" | "completed"; at: string }[];
  startedAt: number;
  error: string | null;
  emit: SseEmitter;
};

export type GraphEnvelope = {
  state: AgentState;
};
