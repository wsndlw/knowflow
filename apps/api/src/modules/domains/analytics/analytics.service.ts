import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  analyticsEvents,
  conversationMessages,
  answerFeedback,
  agents,
  db,
  documents,
  knowledgeItemFeedback,
  knowledgeItems,
  knowledgeBases,
  messageCitations,
  users,
} from "@knowflow/db";
import type {
  AnalyticsEventRequest,
  AnalyticsOverviewResponse,
  AnalyticsRangeQuery,
  AnalyticsTopContent,
  KnowledgeBaseAnalyticsResponse,
} from "@knowflow/shared";
import type { AnyColumn } from "drizzle-orm";
import { and, count, desc, eq, gte, inArray, isNotNull, lte, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { AnalyticsEventService } from "./analytics-event.service.js";

const noAnswerAssistantMessages = alias(conversationMessages, "no_answer_assistant_messages");

type NormalizedRange = AnalyticsRangeQuery & {
  from: string;
  to: string;
  fromDate: Date;
  toDate: Date;
};

type TopContent = AnalyticsTopContent & {
  knowledgeBaseName?: string;
};

type CountWithLastViewed = {
  id: string | null;
  value: number;
  lastViewedAt: Date | string | null;
};

@Injectable()
export class AnalyticsService {
  constructor(
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
    @Inject(AnalyticsEventService)
    private readonly eventService: AnalyticsEventService,
  ) {}

  async recordUserReportedEvent(
    user: AuthenticatedUser,
    input: AnalyticsEventRequest,
  ): Promise<void> {
    if (input.knowledgeBaseId !== undefined) {
      await this.ensureCanAccess(input.knowledgeBaseId, user);
    }

    await this.eventService.recordUserReportedEvent(user, input);
  }

  async getKnowledgeBaseAnalytics(
    knowledgeBaseId: string,
    query: AnalyticsRangeQuery,
    user: AuthenticatedUser,
  ): Promise<KnowledgeBaseAnalyticsResponse> {
    await this.ensureCanAccess(knowledgeBaseId, user);
    const range = this.normalizeRange(query);

    const [
      visits,
      searches,
      questions,
      activeUsers,
      previousVisits,
      previousSearches,
      previousQuestions,
      previousActiveUsers,
      popularDocuments,
      popularKnowledgeItems,
      unvisitedContent,
      noAnswerQuestions,
      lowConfidenceQuestions,
      feedback,
      feedbackReasons,
    ] = await Promise.all([
      this.countEvents(range, { knowledgeBaseId, eventType: "knowledge_base_viewed" }),
      this.countEvents(range, { knowledgeBaseId, eventType: "knowledge_searched" }),
      this.countEvents(range, { knowledgeBaseId, eventType: "question_asked" }),
      this.countActiveUsers(range, knowledgeBaseId),
      this.countEvents(this.previousRange(range), {
        knowledgeBaseId,
        eventType: "knowledge_base_viewed",
      }),
      this.countEvents(this.previousRange(range), {
        knowledgeBaseId,
        eventType: "knowledge_searched",
      }),
      this.countEvents(this.previousRange(range), {
        knowledgeBaseId,
        eventType: "question_asked",
      }),
      this.countActiveUsers(this.previousRange(range), knowledgeBaseId),
      this.getPopularDocuments(range, knowledgeBaseId),
      this.getPopularKnowledgeItems(range, knowledgeBaseId),
      this.getUnvisitedContent(range, knowledgeBaseId),
      this.getNoAnswerQuestions(range, knowledgeBaseId),
      this.getLowConfidenceQuestions(range, knowledgeBaseId),
      this.getKnowledgeBaseFeedback(range, knowledgeBaseId),
      this.getFeedbackReasons(range, knowledgeBaseId),
    ]);

    return {
      range: this.toRangeResponse(range),
      knowledgeBaseId,
      metrics: {
        visits,
        searches,
        questions,
        activeUsers,
      },
      trends: {
        visits: { current: visits, previous: previousVisits },
        searches: { current: searches, previous: previousSearches },
        questions: { current: questions, previous: previousQuestions },
        activeUsers: { current: activeUsers, previous: previousActiveUsers },
      },
      popularDocuments,
      popularKnowledgeItems,
      unvisitedContent,
      noAnswerQuestions,
      lowConfidenceQuestions,
      feedback,
      feedbackReasons,
    };
  }

  async getOverview(
    query: AnalyticsRangeQuery,
    user: AuthenticatedUser,
  ): Promise<AnalyticsOverviewResponse> {
    if (user.platformRole !== "super_admin") {
      throw new ForbiddenException("Only super admins can view platform analytics");
    }

    const range = this.normalizeRange(query);
    const sevenDayRange = this.normalizeRange({ range: "7d" });
    const [
      visits,
      searches,
      questions,
      activeUsers,
      sevenDayActiveUsers,
      entityTotals,
      knowledgeBaseRanking,
      topDocuments,
      topKnowledgeItems,
    ] = await Promise.all([
      this.countEvents(range, { eventType: "knowledge_base_viewed" }),
      this.countEvents(range, { eventType: "knowledge_searched" }),
      this.countEvents(range, { eventType: "question_asked" }),
      this.countActiveUsers(range),
      this.countActiveUsers(sevenDayRange),
      this.getEntityTotals(),
      this.getKnowledgeBaseRanking(range),
      this.getPopularDocuments(range),
      this.getPopularKnowledgeItems(range),
    ]);

    return {
      range: this.toRangeResponse(range),
      totals: {
        visits,
        searches,
        questions,
        activeUsers,
      },
      entityTotals,
      sevenDayActiveUsers,
      knowledgeBases: knowledgeBaseRanking,
      topDocuments: topDocuments.map((item) => ({
        ...item,
        knowledgeBaseName: item.knowledgeBaseName ?? "",
      })),
      topKnowledgeItems: topKnowledgeItems.map((item) => ({
        ...item,
        knowledgeBaseName: item.knowledgeBaseName ?? "",
      })),
    };
  }

  private normalizeRange(query: AnalyticsRangeQuery): NormalizedRange {
    const today = this.toDateOnly(new Date());
    if (query.range === "custom") {
      return this.buildRange("custom", query.from, query.to);
    }
    if (query.range === "today") {
      return this.buildRange("today", today, today);
    }

    const days = query.range === "30d" ? 30 : 7;
    const from = new Date(`${today}T00:00:00.000Z`);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    return this.buildRange(query.range, this.toDateOnly(from), today);
  }

  private buildRange(
    range: NormalizedRange["range"],
    from: string | undefined,
    to: string | undefined,
  ): NormalizedRange {
    if (from === undefined || to === undefined) {
      throw new Error("Analytics range requires from and to");
    }
    return {
      range,
      from,
      to,
      fromDate: new Date(`${from}T00:00:00.000Z`),
      toDate: new Date(`${to}T23:59:59.999Z`),
    };
  }

  private toRangeResponse(range: NormalizedRange): AnalyticsRangeQuery {
    return {
      range: range.range,
      from: range.from,
      to: range.to,
    };
  }

  private toDateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private toIsoDateTime(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return new Date(value).toISOString();
  }

  private previousRange(range: NormalizedRange): NormalizedRange {
    const days =
      Math.floor((range.toDate.getTime() - range.fromDate.getTime()) / 86_400_000) + 1;
    const previousTo = new Date(range.fromDate);
    previousTo.setUTCDate(previousTo.getUTCDate() - 1);
    const previousFrom = new Date(previousTo);
    previousFrom.setUTCDate(previousFrom.getUTCDate() - (days - 1));
    return this.buildRange(
      range.range,
      this.toDateOnly(previousFrom),
      this.toDateOnly(previousTo),
    );
  }

  private eventRangeCondition(range: NormalizedRange): SQL {
    return this.requireCondition(
      and(gte(analyticsEvents.createdDate, range.from), lte(analyticsEvents.createdDate, range.to)),
    );
  }

  private createdAtRangeCondition(
    column: AnyColumn<{ data: Date }>,
    range: NormalizedRange,
  ): SQL {
    return this.requireCondition(and(gte(column, range.fromDate), lte(column, range.toDate)));
  }

  private requireCondition(condition: SQL | undefined): SQL {
    if (condition === undefined) {
      throw new Error("Analytics condition is empty");
    }
    return condition;
  }

  private async countEvents(
    range: NormalizedRange,
    filter: { eventType: typeof analyticsEvents.eventType.enumValues[number]; knowledgeBaseId?: string },
  ): Promise<number> {
    const conditions = [this.eventRangeCondition(range), eq(analyticsEvents.eventType, filter.eventType)];
    if (filter.knowledgeBaseId !== undefined) {
      conditions.push(eq(analyticsEvents.knowledgeBaseId, filter.knowledgeBaseId));
    }
    const [{ value } = { value: 0 }] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(...conditions));
    return value;
  }

  private async countActiveUsers(
    range: NormalizedRange,
    knowledgeBaseId?: string,
  ): Promise<number> {
    const conditions = [this.eventRangeCondition(range)];
    if (knowledgeBaseId !== undefined) {
      conditions.push(eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId));
    }
    const [{ value } = { value: 0 }] = await db
      .select({ value: sql<number>`count(distinct ${analyticsEvents.userId})::int` })
      .from(analyticsEvents)
      .where(and(...conditions));
    return value;
  }

  private async getPopularDocuments(
    range: NormalizedRange,
    knowledgeBaseId?: string,
  ): Promise<TopContent[]> {
    const lastViewedAtExpression = sql<Date | null>`max(${analyticsEvents.createdAt})`;
    const viewConditions = [
      this.eventRangeCondition(range),
      eq(analyticsEvents.eventType, "document_viewed"),
      eq(analyticsEvents.targetType, "document"),
      isNotNull(analyticsEvents.targetId),
    ];
    const citationConditions = [
      this.createdAtRangeCondition(messageCitations.createdAt, range),
      isNotNull(messageCitations.documentId),
    ];
    if (knowledgeBaseId !== undefined) {
      viewConditions.push(eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId));
      citationConditions.push(eq(messageCitations.knowledgeBaseId, knowledgeBaseId));
    }

    const [viewRows, citationRows] = await Promise.all([
      db
        .select({
          id: analyticsEvents.targetId,
          value: sql<number>`count(*)::int`,
          lastViewedAt: lastViewedAtExpression,
        })
        .from(analyticsEvents)
        .where(and(...viewConditions))
        .groupBy(analyticsEvents.targetId)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          id: messageCitations.documentId,
          value: sql<number>`count(*)::int`,
        })
        .from(messageCitations)
        .where(and(...citationConditions))
        .groupBy(messageCitations.documentId)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
    ]);

    const views = this.toCountMap(viewRows);
    const lastViewedAt = this.toLastViewedMap(viewRows);
    const citations = this.toCountMap(citationRows);
    return this.hydrateDocuments(
      [...new Set([...views.keys(), ...citations.keys()])],
      views,
      citations,
      lastViewedAt,
      knowledgeBaseId,
    );
  }

  private async getPopularKnowledgeItems(
    range: NormalizedRange,
    knowledgeBaseId?: string,
  ): Promise<TopContent[]> {
    const lastViewedAtExpression = sql<Date | null>`max(${analyticsEvents.createdAt})`;
    const viewConditions = [
      this.eventRangeCondition(range),
      eq(analyticsEvents.eventType, "knowledge_item_viewed"),
      eq(analyticsEvents.targetType, "knowledge_item"),
      isNotNull(analyticsEvents.targetId),
    ];
    const citationConditions = [
      this.createdAtRangeCondition(messageCitations.createdAt, range),
      isNotNull(messageCitations.knowledgeItemId),
    ];
    if (knowledgeBaseId !== undefined) {
      viewConditions.push(eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId));
      citationConditions.push(eq(messageCitations.knowledgeBaseId, knowledgeBaseId));
    }

    const [viewRows, citationRows] = await Promise.all([
      db
        .select({
          id: analyticsEvents.targetId,
          value: sql<number>`count(*)::int`,
          lastViewedAt: lastViewedAtExpression,
        })
        .from(analyticsEvents)
        .where(and(...viewConditions))
        .groupBy(analyticsEvents.targetId)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          id: messageCitations.knowledgeItemId,
          value: sql<number>`count(*)::int`,
        })
        .from(messageCitations)
        .where(and(...citationConditions))
        .groupBy(messageCitations.knowledgeItemId)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
    ]);

    const views = this.toCountMap(viewRows);
    const lastViewedAt = this.toLastViewedMap(viewRows);
    const citations = this.toCountMap(citationRows);
    return this.hydrateKnowledgeItems(
      [...new Set([...views.keys(), ...citations.keys()])],
      views,
      citations,
      lastViewedAt,
      knowledgeBaseId,
    );
  }

  private toCountMap(rows: { id: string | null; value: number }[]): Map<string, number> {
    return new Map(
      rows
        .filter((row): row is { id: string; value: number } => row.id !== null)
        .map((row) => [row.id, row.value]),
    );
  }

  private toLastViewedMap(rows: CountWithLastViewed[]): Map<string, Date | string | null> {
    return new Map(
      rows
        .filter((row): row is CountWithLastViewed & { id: string } => row.id !== null)
        .map((row) => [row.id, row.lastViewedAt]),
    );
  }

  private async hydrateDocuments(
    ids: string[],
    views: Map<string, number>,
    citations: Map<string, number>,
    lastViewedAt: Map<string, Date | string | null>,
    knowledgeBaseId?: string,
  ): Promise<TopContent[]> {
    if (ids.length === 0) {
      return [];
    }
    const conditions = [inArray(documents.id, ids)];
    if (knowledgeBaseId !== undefined) {
      conditions.push(eq(documents.knowledgeBaseId, knowledgeBaseId));
    }
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        knowledgeBaseName: knowledgeBases.name,
      })
      .from(documents)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, documents.knowledgeBaseId))
      .where(and(...conditions));

    return rows
      .map((row) => ({
        id: row.id,
        title: row.title,
        knowledgeBaseName: row.knowledgeBaseName,
        views: views.get(row.id) ?? 0,
        citations: citations.get(row.id) ?? 0,
        lastViewedAt: this.toIsoDateTime(lastViewedAt.get(row.id) ?? null),
      }))
      .sort((a, b) => b.views + b.citations - (a.views + a.citations))
      .slice(0, 5);
  }

  private async hydrateKnowledgeItems(
    ids: string[],
    views: Map<string, number>,
    citations: Map<string, number>,
    lastViewedAt: Map<string, Date | string | null>,
    knowledgeBaseId?: string,
  ): Promise<TopContent[]> {
    if (ids.length === 0) {
      return [];
    }
    const conditions = [inArray(knowledgeItems.id, ids)];
    if (knowledgeBaseId !== undefined) {
      conditions.push(eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId));
    }
    const rows = await db
      .select({
        id: knowledgeItems.id,
        title: knowledgeItems.title,
        knowledgeBaseName: knowledgeBases.name,
      })
      .from(knowledgeItems)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, knowledgeItems.knowledgeBaseId))
      .where(and(...conditions));

    return rows
      .map((row) => ({
        id: row.id,
        title: row.title,
        knowledgeBaseName: row.knowledgeBaseName,
        views: views.get(row.id) ?? 0,
        citations: citations.get(row.id) ?? 0,
        lastViewedAt: this.toIsoDateTime(lastViewedAt.get(row.id) ?? null),
      }))
      .sort((a, b) => b.views + b.citations - (a.views + a.citations))
      .slice(0, 5);
  }

  private async getUnvisitedContent(
    range: NormalizedRange,
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseAnalyticsResponse["unvisitedContent"]> {
    const documentLastViewedAtExpression = sql<Date | null>`max(${analyticsEvents.createdAt})`;
    const documentViewsExpression = sql<number>`count(${analyticsEvents.id})::int`;
    const documentRows = await db
      .select({
        id: documents.id,
        title: documents.title,
        views: documentViewsExpression,
        lastViewedAt: documentLastViewedAtExpression,
      })
      .from(documents)
      .leftJoin(
        analyticsEvents,
        and(
          eq(analyticsEvents.targetId, documents.id),
          eq(analyticsEvents.targetType, "document"),
          eq(analyticsEvents.eventType, "document_viewed"),
          eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId),
          this.eventRangeCondition(range),
        ),
      )
      .where(eq(documents.knowledgeBaseId, knowledgeBaseId))
      .groupBy(documents.id, documents.title)
      .orderBy(sql`${documentLastViewedAtExpression} asc nulls first`)
      .limit(5);

    const knowledgeItemLastViewedAtExpression = sql<Date | null>`max(${analyticsEvents.createdAt})`;
    const knowledgeItemViewsExpression = sql<number>`count(${analyticsEvents.id})::int`;
    const knowledgeItemRows = await db
      .select({
        id: knowledgeItems.id,
        title: knowledgeItems.title,
        views: knowledgeItemViewsExpression,
        lastViewedAt: knowledgeItemLastViewedAtExpression,
      })
      .from(knowledgeItems)
      .leftJoin(
        analyticsEvents,
        and(
          eq(analyticsEvents.targetId, knowledgeItems.id),
          eq(analyticsEvents.targetType, "knowledge_item"),
          eq(analyticsEvents.eventType, "knowledge_item_viewed"),
          eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId),
          this.eventRangeCondition(range),
        ),
      )
      .where(eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId))
      .groupBy(knowledgeItems.id, knowledgeItems.title)
      .orderBy(sql`${knowledgeItemLastViewedAtExpression} asc nulls first`)
      .limit(5);

    return [
      ...documentRows.map((row) => ({
        id: row.id,
        title: row.title,
        type: "document" as const,
        views: row.views,
        lastViewedAt: this.toIsoDateTime(row.lastViewedAt),
      })),
      ...knowledgeItemRows.map((row) => ({
        id: row.id,
        title: row.title,
        type: "knowledge_item" as const,
        views: row.views,
        lastViewedAt: this.toIsoDateTime(row.lastViewedAt),
      })),
    ]
      .sort((left, right) => {
        if (left.lastViewedAt === null && right.lastViewedAt !== null) {
          return -1;
        }
        if (left.lastViewedAt !== null && right.lastViewedAt === null) {
          return 1;
        }
        return (left.lastViewedAt ?? "").localeCompare(right.lastViewedAt ?? "");
      })
      .slice(0, 10);
  }

  private async getNoAnswerQuestions(
    range: NormalizedRange,
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseAnalyticsResponse["noAnswerQuestions"]> {
    const questionExpression = sql<string>`coalesce((
      select user_messages.content
      from conversation_messages user_messages
      where user_messages.conversation_id = ${noAnswerAssistantMessages.conversationId}
        and user_messages.role = 'user'
        and user_messages.created_at <= ${noAnswerAssistantMessages.createdAt}
      order by user_messages.created_at desc, user_messages.id desc
      limit 1
    ), '')`;
    const noAnswerCountExpression = sql<number>`count(distinct ${noAnswerAssistantMessages.id})::int`;
    const rows = await db
      .select({
        question: questionExpression,
        noAnswerType: noAnswerAssistantMessages.noAnswerType,
        count: noAnswerCountExpression,
      })
      .from(noAnswerAssistantMessages)
      .innerJoin(
        analyticsEvents,
        and(
          eq(analyticsEvents.targetId, noAnswerAssistantMessages.id),
          eq(analyticsEvents.eventType, "answer_generated"),
          eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId),
        ),
      )
      .where(
        and(
          eq(noAnswerAssistantMessages.role, "assistant"),
          isNotNull(noAnswerAssistantMessages.noAnswerType),
          this.createdAtRangeCondition(noAnswerAssistantMessages.createdAt, range),
        ),
      )
      .groupBy(questionExpression, noAnswerAssistantMessages.noAnswerType)
      .orderBy(desc(noAnswerCountExpression))
      .limit(10);

    return rows.map((row) => ({
      question: row.question.length > 0 ? row.question : "(unknown question)",
      count: row.count,
      noAnswerType:
        row.noAnswerType === "no_answer" ||
        row.noAnswerType === "low_confidence" ||
        row.noAnswerType === "knowledge_gap" ||
        row.noAnswerType === "permission_limited" ||
        row.noAnswerType === "attachment_parse_failed"
          ? row.noAnswerType
          : null,
    }));
  }

  private async getLowConfidenceQuestions(
    range: NormalizedRange,
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseAnalyticsResponse["lowConfidenceQuestions"]> {
    const questionExpression = sql<string>`coalesce((
      select user_messages.content
      from conversation_messages user_messages
      where user_messages.conversation_id = ${noAnswerAssistantMessages.conversationId}
        and user_messages.role = 'user'
        and user_messages.created_at <= ${noAnswerAssistantMessages.createdAt}
      order by user_messages.created_at desc, user_messages.id desc
      limit 1
    ), '')`;
    const countExpression = sql<number>`count(distinct ${noAnswerAssistantMessages.id})::int`;
    const lastAskedAtExpression = sql<Date | null>`max(${noAnswerAssistantMessages.createdAt})`;
    const rows = await db
      .select({
        question: questionExpression,
        count: countExpression,
        lastAskedAt: lastAskedAtExpression,
      })
      .from(noAnswerAssistantMessages)
      .innerJoin(
        analyticsEvents,
        and(
          eq(analyticsEvents.targetId, noAnswerAssistantMessages.id),
          eq(analyticsEvents.eventType, "answer_generated"),
          eq(analyticsEvents.knowledgeBaseId, knowledgeBaseId),
        ),
      )
      .where(
        and(
          eq(noAnswerAssistantMessages.role, "assistant"),
          eq(noAnswerAssistantMessages.confidenceLevel, "weak"),
          this.createdAtRangeCondition(noAnswerAssistantMessages.createdAt, range),
        ),
      )
      .groupBy(questionExpression)
      .orderBy(desc(countExpression))
      .limit(10);

    return rows.map((row) => ({
      question: row.question.length > 0 ? row.question : "(unknown question)",
      count: row.count,
      lastAskedAt: this.toIsoDateTime(row.lastAskedAt),
    }));
  }

  private async getKnowledgeBaseFeedback(
    range: NormalizedRange,
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseAnalyticsResponse["feedback"]> {
    const [answerRows, itemRows] = await Promise.all([
      db
        .select({
          useful: sql<number>`count(*) filter (where ${answerFeedback.rating} = 'useful')::int`,
          notUseful: sql<number>`count(*) filter (where ${answerFeedback.rating} = 'not_useful')::int`,
          corrections: sql<number>`count(*) filter (where ${answerFeedback.rating} = 'correction')::int`,
        })
        .from(answerFeedback)
        .where(
          and(
            eq(answerFeedback.knowledgeBaseId, knowledgeBaseId),
            this.createdAtRangeCondition(answerFeedback.createdAt, range),
          ),
        ),
      db
        .select({
          likes: sql<number>`count(*) filter (where ${knowledgeItemFeedback.rating} = 'like')::int`,
          dislikes: sql<number>`count(*) filter (where ${knowledgeItemFeedback.rating} = 'dislike')::int`,
        })
        .from(knowledgeItemFeedback)
        .innerJoin(knowledgeItems, eq(knowledgeItems.id, knowledgeItemFeedback.knowledgeItemId))
        .where(
          and(
            eq(knowledgeItems.knowledgeBaseId, knowledgeBaseId),
            this.createdAtRangeCondition(knowledgeItemFeedback.createdAt, range),
          ),
        ),
    ]);

    return {
      answerUseful: answerRows[0]?.useful ?? 0,
      answerNotUseful: answerRows[0]?.notUseful ?? 0,
      answerCorrections: answerRows[0]?.corrections ?? 0,
      knowledgeItemLikes: itemRows[0]?.likes ?? 0,
      knowledgeItemDislikes: itemRows[0]?.dislikes ?? 0,
    };
  }

  private async getFeedbackReasons(
    range: NormalizedRange,
    knowledgeBaseId: string,
  ): Promise<KnowledgeBaseAnalyticsResponse["feedbackReasons"]> {
    const reasonExpression = sql<string>`coalesce(nullif(${answerFeedback.reason}, ''), 'unspecified')`;
    const countExpression = sql<number>`count(*)::int`;
    const rows = await db
      .select({
        reason: reasonExpression,
        count: countExpression,
      })
      .from(answerFeedback)
      .where(
        and(
          eq(answerFeedback.knowledgeBaseId, knowledgeBaseId),
          this.createdAtRangeCondition(answerFeedback.createdAt, range),
        ),
      )
      .groupBy(reasonExpression)
      .orderBy(desc(countExpression))
      .limit(10);

    return rows;
  }

  private async getKnowledgeBaseRanking(
    range: NormalizedRange,
  ): Promise<AnalyticsOverviewResponse["knowledgeBases"]> {
    const rows = await db
      .select({
        id: knowledgeBases.id,
        name: knowledgeBases.name,
        visits: sql<number>`count(*) filter (where ${analyticsEvents.eventType} = 'knowledge_base_viewed')::int`,
        questions: sql<number>`count(*) filter (where ${analyticsEvents.eventType} = 'question_asked')::int`,
      })
      .from(analyticsEvents)
      .innerJoin(knowledgeBases, eq(knowledgeBases.id, analyticsEvents.knowledgeBaseId))
      .where(
        and(
          this.eventRangeCondition(range),
          inArray(analyticsEvents.eventType, ["knowledge_base_viewed", "question_asked"]),
        ),
      )
      .groupBy(knowledgeBases.id, knowledgeBases.name)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      visits: row.visits,
      questions: row.questions,
      score: row.visits + row.questions,
    }));
  }

  private async getEntityTotals(): Promise<AnalyticsOverviewResponse["entityTotals"]> {
    const [
      [{ value: userCount } = { value: 0 }],
      [{ value: knowledgeBaseCount } = { value: 0 }],
      [{ value: documentCount } = { value: 0 }],
      [{ value: agentCount } = { value: 0 }],
    ] = await Promise.all([
      db.select({ value: count() }).from(users),
      db.select({ value: count() }).from(knowledgeBases),
      db.select({ value: count() }).from(documents),
      db.select({ value: count() }).from(agents).where(eq(agents.type, "official")),
    ]);

    return {
      userCount,
      knowledgeBaseCount,
      documentCount,
      agentCount,
    };
  }

  private async ensureCanAccess(
    knowledgeBaseId: string,
    user: AuthenticatedUser,
  ): Promise<void> {
    if (await this.accessService.canAccess(knowledgeBaseId, user)) {
      return;
    }
    throw new NotFoundException("Knowledge base analytics not found");
  }
}
