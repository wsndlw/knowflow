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
  createModelCatalogRequestSchema,
  createModelProviderRequestSchema,
  modelCatalogListResponseSchema,
  modelCatalogSchema,
  modelProviderListResponseSchema,
  modelProviderSchema,
  modelUsagePolicyListResponseSchema,
  modelUsagePolicySchema,
  modelUsageTypeSchema,
  testModelProviderRequestSchema,
  testModelProviderResponseSchema,
  updateModelCatalogRequestSchema,
  updateModelProviderRequestSchema,
  updateModelUsagePolicyRequestSchema,
  uuidParamSchema,
  type ModelCatalog,
  type ModelCatalogListResponse,
  type ModelProvider,
  type ModelProviderListResponse,
  type ModelUsagePolicy,
  type ModelUsagePolicyListResponse,
  type TestModelProviderResponse,
} from "@knowflow/shared";

import type { AuthenticatedUser } from "../auth/auth.types.js";
import { Roles } from "../../../shared/decorators/roles.decorator.js";
import type { AuthenticatedRequest } from "../../../shared/guards/auth.guard.js";
import { ModelService } from "./model.service.js";

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type EmptySuccess = ApiSuccess<Record<string, never>>;

@Controller()
@Roles("super_admin")
export class ModelController {
  constructor(@Inject(ModelService) private readonly modelService: ModelService) {}

  @Get("admin/model-providers")
  async listProviders(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelProviderListResponse>> {
    const data = await this.modelService.listProviders(this.requireUser(request));
    return { ok: true, data: modelProviderListResponseSchema.parse(data) };
  }

  @Post("admin/model-providers")
  async createProvider(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelProvider>> {
    const input = createModelProviderRequestSchema.parse(body);
    const data = await this.modelService.createProvider(input, this.requireUser(request));
    return { ok: true, data: modelProviderSchema.parse(data) };
  }

  @Patch("admin/model-providers/:id")
  async updateProvider(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelProvider>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateModelProviderRequestSchema.parse(body);
    const data = await this.modelService.updateProvider(id, input, this.requireUser(request));
    return { ok: true, data: modelProviderSchema.parse(data) };
  }

  @Delete("admin/model-providers/:id")
  async deleteProvider(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.modelService.deleteProvider(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Post("admin/model-providers/:id/test")
  async testProvider(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<TestModelProviderResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const input = testModelProviderRequestSchema.parse(body ?? {});
    const data = await this.modelService.testProvider(id, input, this.requireUser(request));
    return { ok: true, data: testModelProviderResponseSchema.parse(data) };
  }

  @Get("admin/model-providers/:id/models")
  async listModels(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelCatalogListResponse>> {
    const { id } = uuidParamSchema.parse(params);
    const data = await this.modelService.listModels(id, this.requireUser(request));
    return { ok: true, data: modelCatalogListResponseSchema.parse(data) };
  }

  @Post("admin/model-providers/:id/models")
  async createModel(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelCatalog>> {
    const { id } = uuidParamSchema.parse(params);
    const input = createModelCatalogRequestSchema.parse(body);
    const data = await this.modelService.createModel(id, input, this.requireUser(request));
    return { ok: true, data: modelCatalogSchema.parse(data) };
  }

  @Patch("admin/models/:id")
  async updateModel(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelCatalog>> {
    const { id } = uuidParamSchema.parse(params);
    const input = updateModelCatalogRequestSchema.parse(body);
    const data = await this.modelService.updateModel(id, input, this.requireUser(request));
    return { ok: true, data: modelCatalogSchema.parse(data) };
  }

  @Delete("admin/models/:id")
  async deleteModel(
    @Param() params: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<EmptySuccess> {
    const { id } = uuidParamSchema.parse(params);
    await this.modelService.deleteModel(id, this.requireUser(request));
    return { ok: true, data: {} };
  }

  @Get("admin/model-usage-policies")
  async listUsagePolicies(
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelUsagePolicyListResponse>> {
    const data = await this.modelService.listUsagePolicies(this.requireUser(request));
    return { ok: true, data: modelUsagePolicyListResponseSchema.parse(data) };
  }

  @Patch("admin/model-usage-policies/:usageType")
  async updateUsagePolicy(
    @Param("usageType") usageTypeParam: unknown,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ): Promise<ApiSuccess<ModelUsagePolicy>> {
    const usageType = modelUsageTypeSchema.parse(usageTypeParam);
    const input = updateModelUsagePolicyRequestSchema.parse(body);
    const data = await this.modelService.updateUsagePolicy(
      usageType,
      input,
      this.requireUser(request),
    );
    return { ok: true, data: modelUsagePolicySchema.parse(data) };
  }

  private requireUser(request: AuthenticatedRequest): AuthenticatedUser {
    if (request.user === undefined) {
      throw new InternalServerErrorException("Authenticated request is missing user");
    }

    return request.user;
  }
}
