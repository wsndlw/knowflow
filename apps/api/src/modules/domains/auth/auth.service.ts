import {
  ACCESS_SESSION_COOKIE_NAME,
  REFRESH_SESSION_COOKIE_NAME,
  type CurrentUser,
  type LoginRequest,
} from "@knowflow/shared";
import { db, sessions, users, verifyPassword } from "@knowflow/db";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { clearCookie, parseCookieHeader, serializeCookie } from "./http-cookie.js";
import { generateSessionToken, hashSessionToken } from "./session-token.js";
import type { AuthenticatedUser, RequestLike, ResponseLike } from "./auth.types.js";

const ACCESS_SESSION_TTL_SECONDS = 15 * 60;
const REFRESH_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

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

@Injectable()
export class AuthService {
  async login(input: LoginRequest, request: RequestLike, response: ResponseLike): Promise<CurrentUser> {
    const user = await db.query.users.findFirst({
      where: eq(users.username, input.username),
    });

    if (user?.status !== "active") {
      throw new UnauthorizedException("Invalid username or password");
    }

    if (!verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid username or password");
    }

    const [access, refresh] = await Promise.all([
      this.createSession(user.id, "access", request),
      this.createSession(user.id, "refresh", request),
    ]);

    this.setSessionCookies(response, access.token, refresh.token);
    return this.toCurrentUser(user);
  }

  async me(request: RequestLike): Promise<CurrentUser> {
    const context = await this.authenticateRequest(request, "access");
    return context.user;
  }

  async refresh(request: RequestLike, response: ResponseLike): Promise<CurrentUser> {
    const refreshContext = await this.authenticateRequest(request, "refresh");
    const oldAccessToken = this.readCookie(request, ACCESS_SESSION_COOKIE_NAME);
    if (oldAccessToken !== undefined) {
      await this.revokeToken(oldAccessToken, "access");
    }

    const access = await this.createSession(refreshContext.user.id, "access", request);
    this.setAccessCookie(response, access.token);
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
      throw new UnauthorizedException("Authentication required");
    }

    const session = await db.query.sessions.findFirst({
      where: and(eq(sessions.sessionTokenHash, hashSessionToken(token)), eq(sessions.type, type)),
    });

    if (session?.revokedAt !== null || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Authentication required");
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, session.userId),
    });

    if (user?.status !== "active") {
      throw new UnauthorizedException("Authentication required");
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
      ip: this.getRequestIp(request),
      userAgent: this.getHeader(request, "user-agent"),
    });

    return { token, expiresAt };
  }

  private async revokeToken(token: string, type: SessionType): Promise<void> {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.sessionTokenHash, hashSessionToken(token)), eq(sessions.type, type)));
  }

  private setSessionCookies(response: ResponseLike, accessToken: string, refreshToken: string): void {
    response.setHeader("Set-Cookie", [
      this.buildAccessCookie(accessToken),
      this.buildRefreshCookie(refreshToken),
    ]);
  }

  private setAccessCookie(response: ResponseLike, accessToken: string): void {
    response.setHeader("Set-Cookie", this.buildAccessCookie(accessToken));
  }

  private clearSessionCookies(response: ResponseLike): void {
    const secure = this.useSecureCookies();
    response.setHeader("Set-Cookie", [
      clearCookie(ACCESS_SESSION_COOKIE_NAME, secure),
      clearCookie(REFRESH_SESSION_COOKIE_NAME, secure),
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
      path: "/auth/refresh",
      sameSite: "Lax",
      secure: this.useSecureCookies(),
    });
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

  private getRequestIp(request: RequestLike): string | null {
    const forwarded = this.getHeader(request, "x-forwarded-for");
    if (forwarded !== undefined) {
      return forwarded.split(",")[0]?.trim() ?? null;
    }

    return request.ip ?? request.socket?.remoteAddress ?? null;
  }

  private useSecureCookies(): boolean {
    return process.env["NODE_ENV"] === "production";
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
