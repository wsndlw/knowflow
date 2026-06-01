import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

type JsonResponse = {
  status: (statusCode: number) => {
    json: (body: unknown) => void;
  };
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<JsonResponse>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      ok: false,
      error: {
        code: exception instanceof HttpException ? exception.name : "InternalServerError",
        message: this.resolveMessage(exception),
      },
    });
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === "string") {
        return response;
      }

      return this.formatExceptionResponse(response as Record<string, unknown>, exception.message);
    }

    return exception instanceof Error ? exception.message : "Unexpected server error";
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
