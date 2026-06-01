import "reflect-metadata";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./modules/app.module.js";
import { GlobalExceptionFilter } from "./shared/filters/global-exception.filter.js";

const DEFAULT_PORT = 4000;

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: process.env["WEB_ORIGIN"] ?? "http://localhost:3000",
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = Number(process.env["API_PORT"] ?? DEFAULT_PORT);
  await app.listen(port, process.env["API_HOST"] ?? "0.0.0.0");
}

void bootstrap();
