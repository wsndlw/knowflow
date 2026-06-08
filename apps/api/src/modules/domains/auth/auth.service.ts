import {
  ACCESS_SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME,
  REFRESH_SESSION_COOKIE_NAME,
  SECURE_CSRF_COOKIE_NAME,
  type CurrentUser,
  type LoginRequest,
} from "@knowflow/shared";
import { db, sessions, users, verifyPassword } from "@knowflow/db";
import { HttpException, HttpStatus, Injectable, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";

import { getClientIp } from "../../../shared/net/client-ip.js";
import {
  clearCookie,
  clearCsrfCookie,
  parseCookieHeader,
  serializeCookie,
  serializeCsrfCookie,
} from "./http-cookie.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";
import type { AuthenticatedUser, RequestLike, ResponseLike } from "./auth.types.js";

const ACCESS_SESSION_TTL_SECONDS = 15 * 60;
const REFRESH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 5 * 60 * 1000;

type SessionType = "access" | "refresh";

type SessionRecord = typeof sessions.$inferSelect;

type UserRecord = typeof users.$inferSelect;

type SessionContext = {
  session: SessionRecord;
  user: AuthenticatedUser;
};

type CreatedSession = {
  token: string;
  expiresAt: Date;
};

type LoginFailureBucket = {
  count: number;
  expiresAt: number;
};

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, LoginFailureBucket>();

  async login(input: LoginRequest, request: RequestLike, response: ResponseLike): Promise<CurrentUser> {
    const failureKey = this.buildLoginFailureKey(input.username, request);
    this.assertLoginAllowed(failureKey);

    const user = await db.query.users.findFirst({
      where: eq(users.username, input.username),
    });

    if (user?.status !== "active") {
      this.recordLoginFailure(failureKey);
      throw new UnauthorizedException("用户名或密码错误");
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      this.recordLoginFailure(failureKey);
      throw new UnauthorizedException("用户名或密码错误");
    }

    const [access, refresh] = await Promise.all([
      this.createSession(user.id, "access", request),
      this.createSession(user.id, "refresh", request),
    ]);

    this.setSessionCookies(response, access.token, refresh.token);
    this.clearLoginFailures(failureKey);
    return this.toCurrentUser(user);
  }

  async me(request: RequestLike): Promise<CurrentUser> {
    const context = await this.authenticateRequest(request, "access");
    return context.user;
  }

  async refresh(request: RequestLike, response: ResponseLike): Promise<CurrentUser> {
    const refreshContext = await this.authenticateRequest(request, "refresh");
    const oldAccessToken = this.readCookie(request, ACCESS_SESSION_COOKIE_NAME);
    const oldRefreshToken = this.readCookie(request, REFRESH_SESSION_COOKIE_NAME);
    if (oldAccessToken !== undefined) {
      await this.revokeToken(oldAccessToken, "access");
    }
    if (oldRefreshToken !== undefined) {
      const revokedRefresh = await this.revokeToken(oldRefreshToken, "refresh", {
        onlyIfActive: true,
      });
      if (!revokedRefresh) {
        throw new UnauthorizedException("请先登录");
      }
    }

    const [access, refresh] = await Promise.all([
      this.createSession(refreshContext.user.id, "access", request),
      this.createSession(refreshContext.user.id, "refresh", request),
    ]);
    this.setSessionCookies(response, access.token, refresh.token);
    return refreshContext.user;
  }

  async logout(request: RequestLike, response: ResponseLike): Promise<void> {
    const accessToken = this.readCookie(request, ACCESS_SESSION_COOKIE_NAME);
    const refreshToken = this.readCookie(request, REFRESH_SESSION_COOKIE_NAME);

    await Promise.all([
      accessToken === undefined ? Promise.resolve() : this.revokeToken(accessToken, "access"),
      refreshToken === undefined ? Promise.resolve() : this.revokeToken(refreshToken, "refresh"),
    ]);

    this.clearSessionCookies(response);
  }

  async authenticateRequest(
    request: RequestLike,
    type: SessionType = "access",
  ): Promise<SessionContext> {
    const cookieName =
      type === "access" ? ACCESS_SESSION_COOKIE_NAME : REFRESH_SESSION_COOKIE_NAME;
    const token = this.readCookie(request, cookieName);
    if (token === undefined) {
      throw new UnauthorizedException("请先登录");
    }

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.sessionTokenHash, hashSessionToken(token)), eq(sessions.type, type)),
    });

    if (!session) {
      throw new UnauthorizedException("请先登录");
    }

    if (session.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("请先登录");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (user?.status !== "active") {
      throw new UnauthorizedException("请先登录");
    }

    await db.update(sessions).set({ lastSeenAt: new Date() }).where(eq(sessions.id, session.id));

    return {
      session,
      user: this.toCurrentUser(user),
    };
  }

  private async createSession(
    userId: string,
    type: SessionType,
    request: RequestLike,
  ): Promise<CreatedSession> {
    const token = generateSessionToken();
    const ttlSeconds =
      type === "access" ? ACCESS_SESSION_TTL_SECONDS : REFRESH_SESSION_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await db.insert(sessions).values({
      userId,
      type,
      sessionTokenHash: hashSessionToken(token),
      expiresAt,
      ip: getClientIp(request),
      userAgent: this.getHeader(request, "user-agent"),
    });

    return { token, expiresAt };
  }

  private async revokeToken(
    token: string,
    type: SessionType,
    options: { onlyIfActive?: boolean } = {},
  ): Promise<boolean> {
    const where = options.onlyIfActive
      ? and(
          eq(sessions.sessionTokenHash, hashSessionToken(token)),
          eq(sessions.type, type),
          isNull(sessions.revokedAt),
        )
      : and(eq(sessions.sessionTokenHash, hashSessionToken(token)), eq(sessions.type, type));
    const revoked = await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(where)
      .returning({ id: sessions.id });
    return revoked.length > 0;
  }

  private setSessionCookies(response: ResponseLike, accessToken: string, refreshToken: string): void {
    response.setHeader("Set-Cookie", [
      this.buildAccessCookie(accessToken),
      this.buildRefreshCookie(refreshToken),
      this.buildCsrfCookie(),
    ]);
  }

  private clearSessionCookies(response: ResponseLike): void {
    const secure = this.useSecureCookies();
    response.setHeader("Set-Cookie", [
      clearCookie(ACCESS_SESSION_COOKIE_NAME, secure),
      clearCookie(REFRESH_SESSION_COOKIE_NAME, secure),
      clearCsrfCookie(this.getCsrfCookieName(), secure),
    ]);
  }

  private buildAccessCookie(token: string): string {
    return serializeCookie(ACCESS_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAgeSeconds: ACCESS_SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "Lax",
      secure: this.useSecureCookies(),
    });
  }

  private buildRefreshCookie(token: string): string {
    return serializeCookie(REFRESH_SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAgeSeconds: REFRESH_SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "Lax",
      secure: this.useSecureCookies(),
    });
  }

  private buildCsrfCookie(): string {
    const secure = this.useSecureCookies();
    return serializeCsrfCookie(this.getCsrfCookieName(), randomBytes(32).toString("hex"), secure);
  }

  private getCsrfCookieName(): string {
    return this.useSecureCookies() ? SECURE_CSRF_COOKIE_NAME : CSRF_COOKIE_NAME;
  }

  private readCookie(request: RequestLike, name: string): string | undefined {
    const cookieHeader = this.getHeader(request, "cookie");
    return parseCookieHeader(cookieHeader)[name];
  }

  private getHeader(request: RequestLike, name: keyof RequestLike["headers"]): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return value;
  }

  private useSecureCookies(): boolean {
    return process.env["NODE_ENV"] === "production";
  }

  private buildLoginFailureKey(username: string, request: RequestLike): string {
    return `${username.trim().toLowerCase()}:${getClientIp(request) ?? "unknown"}`;
  }

  private assertLoginAllowed(key: string): void {
    const bucket = this.loginFailures.get(key);
    if (bucket === undefined) {
      return;
    }

    if (bucket.expiresAt <= Date.now()) {
      this.loginFailures.delete(key);
      return;
    }

    if (bucket.count >= LOGIN_FAILURE_LIMIT) {
      throw new HttpException("用户名或密码错误", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private recordLoginFailure(key: string): void {
    const now = Date.now();
    const existing = this.loginFailures.get(key);
    if (existing === undefined || existing.expiresAt <= now) {
      this.loginFailures.set(key, {
        count: 1,
        expiresAt: now + LOGIN_FAILURE_WINDOW_MS,
      });
      return;
    }

    existing.count += 1;
  }

  private clearLoginFailures(key: string): void {
    this.loginFailures.delete(key);
  }

  private toCurrentUser(user: UserRecord): CurrentUser {
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      platformRole: user.platformRole,
      departmentId: user.departmentId,
    };
  }
}
