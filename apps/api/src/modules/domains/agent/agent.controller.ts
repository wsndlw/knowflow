import {
  Body,
  Controller,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import {
  agentListResponseSchema,
  answerFeedbackRequestSchema,
  askMessageRequestSchema,
  conversationListResponseSchema,
  conversationMessagesResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  uuidParamSchema,
  type AgentListResponse,
  type Conversation,
  type ConversationListResponse,
  type ConversationMessagesResponse,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AgentService } from "./agent.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

type SseResponse = {
  status: (statusCode: number) => SseResponse;
  setHeader: (name: string, value: string) => void;
  write: (chunk: string) => void;
  end: () => void;
};

@Controller()
export class AgentController {
  constructor(
    @Inject(AgentService)
    private readonly agentService: AgentService,
  ) {}

  @Get("agents")
  async listAgents(@Req() request: AuthenticatedRequest): Promise<ApiSuccess<AgentListResponse>> {
    const data = await this.agentService.listAgents(this.requireUser(request));
    return { ok: true, data: agentListResponseSchema.parse(data) };
  }

  @Post("conversations")
  async createConversation(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<Conversation>> {
    const input = createConversationRequestSchema.parse(body);
    const data = await this.agentService.createConversation(input, this.requireUser(request));
    return { ok: true, data: conversationSchema.parse(data) };
  }

  @Get("conversations")
  async listConversations(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ConversationListResponse>> {
    const data = await this.agentService.listConversations(this.requireUser(request));
    return { ok: true, data: conversationListResponseSchema.parse(data) };
  }

  @Get("conversations/:id/messages")
  async listMessages(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ConversationMessagesResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentService.listMessages(id, this.requireUser(request));
    return { ok: true, data: conversationMessagesResponseSchema.parse(data) };
  }

  @Post("conversations/:id/messages")
  async ask(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res() response: SseResponse,
  ): Promise<void> {
    const { id } = uuidParamSchema.parse(params);
    const input = askMessageRequestSchema.parse(body);
    const user = this.requireUser(request);

    response.status(200);
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");

    const writeEvent = (event: unknown): void => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      await this.agentService.ask({
        conversationId: id,
        content: input.content,
        user,
        emit: (event) => Promise.resolve(writeEvent(event)),
      });
    } catch (error) {
      writeEvent({
        type: "agent.failed",
        message: error instanceof Error ? error.message : "Agent request failed",
      });
    } finally {
      response.end();
    }
  }

  @Post("messages/:id/feedback")
  async createFeedback(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    const input = answerFeedbackRequestSchema.parse(body);
    await this.agentService.createFeedback(id, input, this.requireUser(request));
    return { ok: true, data: {} };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
