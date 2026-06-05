import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { conversations, db } from "@knowflow/db";

import { SUMMARY_MAX_CHARS } from "./agent-memory.js";
import { processConversationSummary } from "./conversation-summary-processor.js";

type MutableDb = {
  select: unknown;
  update: unknown;
};

type CompleteChatInput = {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  usageType?: string;
  temperature?: number;
  maxOutputTokens?: number;
};

void describe("processConversationSummary", () => {
  void it("summarizes old messages, clamps output, and writes the conversation cursor", async () => {
    const mutableDb = db as unknown as MutableDb;
    const originalSelect = mutableDb.select;
    const originalUpdate = mutableDb.update;
    const messages = Array.from({ length: 12 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, "0")}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message ${String(index + 1)}`,
      createdAt: new Date(index + 1),
    }));
    const update = { table: undefined as unknown, values: undefined as Record<string, unknown> | undefined };
    const llmCalls: CompleteChatInput[] = [];

    mutableDb.select = makeSelectStub([
      [{ rollingSummary: "existing summary", summarizedMessageCount: 0 }],
      messages,
    ]);
    mutableDb.update = (table: unknown) => ({
      set(values: Record<string, unknown>) {
        update.table = table;
        update.values = values;
        return {
          where() {
            return Promise.resolve([]);
          },
        };
      },
    });

    try {
      const result = await processConversationSummary(
        {
          completeChat(input: CompleteChatInput) {
            llmCalls.push(input);
            return Promise.resolve("x".repeat(SUMMARY_MAX_CHARS + 20));
          },
        } as unknown as Parameters<typeof processConversationSummary>[0],
        "00000000-0000-0000-0000-000000000001",
      );

      assert.equal(result.status, "completed");
      assert.equal(result.summarizedMessageCount, 6);
      assert.equal(update.table, conversations);
      const updateValues = update.values;
      assert.ok(updateValues);
      assert.equal(updateValues["rollingSummary"], "x".repeat(SUMMARY_MAX_CHARS));
      assert.equal(updateValues["summarizedMessageCount"], 6);
      const [llmCall] = llmCalls;
      assert.ok(llmCall);
      assert.equal(llmCall.usageType, "query_understanding");
      assert.equal(
        llmCall.messages.some((message) => message.content.includes("untrusted data")),
        true,
      );
    } finally {
      mutableDb.select = originalSelect;
      mutableDb.update = originalUpdate;
    }
  });
});

function makeSelectStub(results: unknown[][]) {
  let index = 0;
  return () => ({
    from() {
      return {
        where() {
          return {
            limit() {
              return Promise.resolve(results[index++] ?? []);
            },
            orderBy() {
              return Promise.resolve(results[index++] ?? []);
            },
          };
        },
      };
    },
  });
}
