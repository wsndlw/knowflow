import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ZodError } from "@knowflow/shared";

type JsonResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const status = this.resolveStatus(exception);
    this.logInternalError(exception);

    response.status(status).json({
      ok: false,
      error: {
        code: this.resolveCode(exception),
        message: this.resolveMessage(exception),
      },
    });
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof ZodError) {
      return HttpStatus.BAD_REQUEST;
    }

    return exception instanceof HttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveCode(exception: unknown): string {
    if (exception instanceof ZodError) {
      return "BadRequestException";
    }

    return exception instanceof HttpException ? exception.name : "InternalServerError";
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof ZodError) {
      return this.formatZodError(exception);
    }

    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "string") {
        return response;
      }

      return this.formatExceptionResponse(response as Record<string, unknown>, exception.message);
    }

    return "Unexpected server error";
  }

  private logInternalError(exception: unknown): void {
    if (exception instanceof ZodError || exception instanceof HttpException) {
      return;
    }

    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      return;
    }

    this.logger.error(`Unexpected non-error exception: ${String(exception)}`);
  }

  private formatZodError(error: ZodError): string {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "request";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
  }

  private formatExceptionResponse(
    response: Record<string, unknown>,
    fallbackMessage: string,
  ): string {
    const message = response["message"];
    if (typeof message === "string") {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("; ");
    }
    if (message !== undefined) {
      return JSON.stringify(message);
    }

    return fallbackMessage;
  }
}
