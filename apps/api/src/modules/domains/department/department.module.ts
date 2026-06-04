import { Module } from "@nestjs/common";

import { DepartmentController } from "./department.controller.js";
import { DepartmentService } from "./department.service.js";

@Module({
  controllers: [DepartmentController],
  providers: [DepartmentService],
  exports: [DepartmentService],
})
export class DepartmentModule {}
