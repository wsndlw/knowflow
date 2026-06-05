import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildConversationSummaryJobId,
  buildConversationSummaryJobOptions,
} from "./conversation-summary-queue.js";

void describe("conversation summary queue options", () => {
  void it("deduplicates active jobs but removes completed jobs so later summaries can enqueue", () => {
    const conversationId = "00000000-0000-0000-0000-000000000001";
    const options = buildConversationSummaryJobOptions(conversationId);

    assert.equal(options.jobId, buildConversationSummaryJobId(conversationId));
    assert.equal(options.removeOnComplete, true);
    assert.deepEqual(options.removeOnFail, { count: 1000 });
  });
});
