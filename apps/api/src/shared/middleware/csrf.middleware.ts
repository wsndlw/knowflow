import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, SECURE_CSRF_COOKIE_NAME } from "@knowflow/shared";

import { parseCookieHeader } from "../../modules/domains/auth/http-cookie.js";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const EXEMPT_ROUTES = new Set(["/auth/login", "/auth/refresh"]);
const CSRF_TOKEN_PATTERN = /^[a-f0-9]{64}$/;

type CsrfRequest = {
  method: string;
  path: string;
  headers: {
    cookie?: string;
  };
  get: (name: string) => string | undefined;
};

type CsrfResponse = {
  status: (code: number) => {
    json: (body: unknown) => void;
  };
};

type Next = () => void;

export function csrfMiddleware(request: CsrfRequest, response: CsrfResponse, next: Next): void {
  if (!STATE_CHANGING_METHODS.has(request.method) || EXEMPT_ROUTES.has(request.path)) {
    next();
    return;
  }

  const cookies = parseCookieHeader(request.headers.cookie);
  const csrfCookie = cookies[SECURE_CSRF_COOKIE_NAME] ?? cookies[CSRF_COOKIE_NAME];
  const csrfHeader = request.get(CSRF_HEADER_NAME);
  if (isValidCsrfToken(csrfCookie) && csrfCookie === csrfHeader) {
    next();
    return;
  }

  response.status(403).json({
    ok: false,
    error: {
      code: "CSRF_FAILED",
      message: "CSRF 令牌验证失败",
    },
  });
}

function isValidCsrfToken(token: string | undefined): token is string {
  return token !== undefined && CSRF_TOKEN_PATTERN.test(token);
}
