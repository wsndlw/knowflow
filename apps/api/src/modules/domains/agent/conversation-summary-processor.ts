import { conversationMessages, conversations, db } from "@knowflow/db";
import { and, asc, eq, inArray } from "drizzle-orm";

import { AliyunLlmService } from "../../../shared/llm/aliyun-llm.js";
import {
  buildRollingSummaryPrompt,
  clampSummary,
  selectMessagesForRollingSummary,
} from "./agent-memory.js";
import type { ConversationSummaryJobResult } from "./conversation-summary-queue.js";

export async function processConversationSummary(
  llm: AliyunLlmService,
  conversationId: string,
): Promise<ConversationSummaryJobResult> {
  const [conversation] = await db
    .select({
      rollingSummary: conversations.rollingSummary,
      summarizedMessageCount: conversations.summarizedMessageCount,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (conversation === undefined) {
    return { conversationId, status: "skipped" };
  }

  const messages = await db
    .select({
      id: conversationMessages.id,
      role: conversationMessages.role,
      content: conversationMessages.content,
      createdAt: conversationMessages.createdAt,
    })
    .from(conversationMessages)
    .where(
      and(
        eq(conversationMessages.conversationId, conversationId),
        inArray(conversationMessages.role, ["user", "assistant"]),
      ),
    )
    .orderBy(asc(conversationMessages.createdAt));
  const selection = selectMessagesForRollingSummary(
    messages,
    conversation.summarizedMessageCount,
  );
  if (selection.messagesToSummarize.length === 0) {
    return {
      conversationId,
      status: "skipped",
      summarizedMessageCount: conversation.summarizedMessageCount,
    };
  }

  const summary = clampSummary(
    await llm.completeChat({
      messages: [
        {
          role: "system",
          content:
            "You maintain compact, factual conversation memory. Output only the updated summary.",
        },
        {
          role: "user",
          content: buildRollingSummaryPrompt(
            conversation.rollingSummary,
            selection.messagesToSummarize,
          ),
        },
      ],
      usageType: "query_understanding",
      temperature: 0,
      maxOutputTokens: 700,
    }),
  );
  if (summary.length === 0) {
    return {
      conversationId,
      status: "skipped",
      summarizedMessageCount: conversation.summarizedMessageCount,
    };
  }

  await db
    .update(conversations)
    .set({
      rollingSummary: summary,
      summarizedMessageCount: selection.summarizedMessageCount,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  return {
    conversationId,
    status: "completed",
    summarizedMessageCount: selection.summarizedMessageCount,
  };
}
