import {
  Body,
  Controller,
  Inject,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  retrievalTestRequestSchema,
  retrievalTestResponseSchema,
  uuidParamSchema,
  type RetrievalTestResponse,
} from "@knowflow/shared";

import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeBaseAccessService } from "../knowledge-base/knowledge-base-access.service.js";
import { RetrievalService } from "./retrieval.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

@Controller()
export class RetrievalController {
  constructor(
    @Inject(RetrievalService)
    private readonly retrievalService: RetrievalService,
    @Inject(KnowledgeBaseAccessService)
    private readonly accessService: KnowledgeBaseAccessService,
  ) {}

  @Post("knowledge-bases/:id/retrieval-test")
  async testRetrieve(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<RetrievalTestResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const user = this.requireUser(request);
    if (!(await this.accessService.canAccess(id, user))) {
      throw new NotFoundException("Knowledge base not found");
    }

    const data = await this.retrievalService.testRetrieve({
      knowledgeBaseId: id,
      request: retrievalTestRequestSchema.parse(body),
      canManage: await this.accessService.canManage(id, user),
    });
    return { ok: true, data: retrievalTestResponseSchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
