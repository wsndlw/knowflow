import { BadRequestException, Logger } from "@nestjs/common";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { GlobalExceptionFilter } from "./global-exception.filter.js";

type ProbeResult = {
  statusCode: number;
  body: unknown;
};

const originalLoggerError = Object.getOwnPropertyDescriptor(Logger.prototype, "error");

afterEach(() => {
  if (originalLoggerError !== undefined) {
    Object.defineProperty(Logger.prototype, "error", originalLoggerError);
  }
});

function runProbe(exception: unknown): ProbeResult {
  const result: ProbeResult = {
    statusCode: 0,
    body: undefined,
  };
  const filter = new GlobalExceptionFilter();

  filter.catch(exception, {
    switchToHttp() {
      return {
        getResponse() {
          return {
            status(statusCode: number) {
              result.statusCode = statusCode;
              return {
                json(body: unknown): void {
                  result.body = body;
                },
              };
            },
          };
        },
      };
    },
  } as never);

  return result;
}

void describe("GlobalExceptionFilter", () => {
  void it("redacts non-http error messages from API responses and logs details", () => {
    const logs: { message: string; stack: string | undefined }[] = [];
    Object.defineProperty(Logger.prototype, "error", {
      configurable: true,
      value(message: string, stack?: string): void {
        logs.push({ message, stack });
      },
    });
    const exception = new Error("provider secret response body");

    const result = runProbe(exception);

    assert.equal(result.statusCode, 500);
    assert.deepEqual(result.body, {
      ok: false,
      error: {
        code: "InternalServerError",
        message: "Unexpected server error",
      },
    });
    assert.equal(logs.length, 1);
    const [log] = logs;
    if (log === undefined) {
      throw new Error("Expected internal error log");
    }
    assert.equal(log.message, "provider secret response body");
    assert.match(log.stack ?? "", /provider secret response body/);
  });

  void it("preserves HttpException business messages", () => {
    const result = runProbe(new BadRequestException("业务参数错误"));

    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.body, {
      ok: false,
      error: {
        code: "BadRequestException",
        message: "业务参数错误",
      },
    });
  });
});
