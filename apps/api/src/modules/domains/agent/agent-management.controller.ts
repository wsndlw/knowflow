import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  InternalServerErrorException,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import {
  AuditTargetType,
  createManagedAgentRequestSchema,
  generateManagedAgentResponseSchema,
  managedAgentListResponseSchema,
  managedAgentSchema,
  updateManagedAgentRequestSchema,
  uuidParamSchema,
  type GenerateManagedAgentResponse,
  type ManagedAgent,
  type ManagedAgentListResponse,
} from "@knowflow/shared";

import { AuditLog } from "../../../shared/audit/audit-log.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { AgentManagementService } from "./agent-management.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
export class AgentManagementController {
  constructor(
    @Inject(AgentManagementService)
    private readonly agentManagementService: AgentManagementService,
  ) {}

  @Get("knowledge-bases/:id/agents")
  async listByKnowledgeBase(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgentListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentManagementService.listByKnowledgeBase(
      id,
      this.requireUser(request),
    );
    return { ok: true, data: managedAgentListResponseSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/agents")
  @AuditLog("agent.create", AuditTargetType.AGENT)
  async create(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgent>> {
    const { id } = uuidParamSchema.parse(params);
    const input = createManagedAgentRequestSchema.parse(body);
    const data = await this.agentManagementService.create(id, input, this.requireUser(request));
    return { ok: true, data: managedAgentSchema.parse(data) };
  }

  @Post("knowledge-bases/:id/agents/generate")
  @AuditLog("agent.generate", AuditTargetType.AGENT)
  async generate(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<GenerateManagedAgentResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentManagementService.generate(id, this.requireUser(request));
    return { ok: true, data: generateManagedAgentResponseSchema.parse(data) };
  }

  @Get("agents/:id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgent>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentManagementService.get(id, this.requireUser(request));
    return { ok: true, data: managedAgentSchema.parse(data) };
  }

  @Patch("agents/:id")
  @AuditLog("agent.update", AuditTargetType.AGENT)
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgent>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateManagedAgentRequestSchema.parse(body);
    const data = await this.agentManagementService.update(id, input, this.requireUser(request));
    return { ok: true, data: managedAgentSchema.parse(data) };
  }

  @Post("agents/:id/publish")
  @AuditLog("agent.publish", AuditTargetType.AGENT)
  async publish(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgent>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentManagementService.publish(id, this.requireUser(request));
    return { ok: true, data: managedAgentSchema.parse(data) };
  }

  @Post("agents/:id/disable")
  async disable(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ManagedAgent>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.agentManagementService.disable(id, this.requireUser(request));
    return { ok: true, data: managedAgentSchema.parse(data) };
  }

  @Delete("agents/:id")
  @AuditLog("agent.delete", AuditTargetType.AGENT)
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.agentManagementService.delete(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
