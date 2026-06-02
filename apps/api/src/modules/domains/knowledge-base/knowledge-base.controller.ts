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
  Query,
  Req,
} from "@nestjs/common";
import {
  createKnowledgeBaseRequestSchema,
  knowledgeBaseListQuerySchema,
  knowledgeBaseOverviewSchema,
  knowledgeBaseUserRequestSchema,
  updateKnowledgeBaseRequestSchema,
  uuidParamSchema,
  type DepartmentOptionsResponse,
  type KnowledgeBase,
  type KnowledgeBaseListResponse,
  type KnowledgeBaseMembersResponse,
  type KnowledgeBaseOverview,
  type UserOptionsResponse,
} from "@knowflow/shared";

import { Roles } from "../../../shared/decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { KnowledgeBaseService } from "./knowledge-base.service.js";

type EmptySuccess = {
  ok: true;
  data: Record<string, never>;
};

type KnowledgeBaseSuccess = {
  ok: true;
  data: KnowledgeBase;
};

type KnowledgeBaseListSuccess = {
  ok: true;
  data: KnowledgeBaseListResponse;
};

type KnowledgeBaseMembersSuccess = {
  ok: true;
  data: KnowledgeBaseMembersResponse;
};

type KnowledgeBaseOverviewSuccess = {
  ok: true;
  data: KnowledgeBaseOverview;
};

type DepartmentOptionsSuccess = {
  ok: true;
  data: DepartmentOptionsResponse;
};

type UserOptionsSuccess = {
  ok: true;
  data: UserOptionsResponse;
};

@Controller("knowledge-bases")
export class KnowledgeBaseController {
  constructor(
    @Inject(KnowledgeBaseService)
    private readonly knowledgeBaseService: KnowledgeBaseService,
  ) {}

  @Get()
  async list(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseListSuccess> {
    return {
      ok: true,
      data: await this.knowledgeBaseService.list(
        knowledgeBaseListQuerySchema.parse(query),
        this.requireUser(request),
      ),
    };
  }

  @Post()
  @Roles("super_admin", "department_admin")
  async create(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    return {
      ok: true,
      data: await this.knowledgeBaseService.create(
        createKnowledgeBaseRequestSchema.parse(body),
        this.requireUser(request),
      ),
    };
  }

  @Get("departments/options")
  async listDepartmentOptions(
    @Req() request: AuthenticatedRequest,
  ): Promise<DepartmentOptionsSuccess> {
    return {
      ok: true,
      data: await this.knowledgeBaseService.listDepartmentOptions(this.requireUser(request)),
    };
  }

  @Get(":id")
  async get(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.get(id, this.requireUser(request)),
    };
  }

  @Get(":id/overview")
  async getOverview(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseOverviewSuccess> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.knowledgeBaseService.getOverview(id, this.requireUser(request));
    return {
      ok: true,
      data: knowledgeBaseOverviewSchema.parse(data),
    };
  }

  @Get(":id/user-options")
  async listUserOptions(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<UserOptionsSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.listUserOptions(id, this.requireUser(request)),
    };
  }

  @Patch(":id")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.update(
        id,
        updateKnowledgeBaseRequestSchema.parse(body),
        this.requireUser(request),
      ),
    };
  }

  @Delete(":id")
  async delete(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.knowledgeBaseService.delete(id, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  @Get(":id/members")
  async listMembers(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<KnowledgeBaseMembersSuccess> {
    const { id } = uuidParamSchema.parse(params);
    return {
      ok: true,
      data: await this.knowledgeBaseService.listMembers(id, this.requireUser(request)),
    };
  }

  @Post(":id/members")
  async addMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    const { userId } = knowledgeBaseUserRequestSchema.parse(body);
    await this.knowledgeBaseService.addMember(id, userId, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  @Delete(":id/members/:userId")
  async removeMember(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const parsed = uuidParamSchema
      .extend({ userId: knowledgeBaseUserRequestSchema.shape.userId })
      .parse(params);
    await this.knowledgeBaseService.removeMember(parsed.id, parsed.userId, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  @Post(":id/admins")
  async addAdmin(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    const { userId } = knowledgeBaseUserRequestSchema.parse(body);
    await this.knowledgeBaseService.addAdmin(id, userId, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  @Delete(":id/admins/:userId")
  async removeAdmin(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const parsed = uuidParamSchema
      .extend({ userId: knowledgeBaseUserRequestSchema.shape.userId })
      .parse(params);
    await this.knowledgeBaseService.removeAdmin(parsed.id, parsed.userId, this.requireUser(request));
    return {
      ok: true,
      data: {},
    };
  }

  private requireUser(request: AuthenticatedRequest) {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
