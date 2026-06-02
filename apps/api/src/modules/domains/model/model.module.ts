import { Module } from "@nestjs/common";

import { ModelController } from "./model.controller.js";
import { ModelService } from "./model.service.js";

@Module({
  controllers: [ModelController],
  providers: [ModelService],
  exports: [ModelService],
})
export class ModelModule {}
