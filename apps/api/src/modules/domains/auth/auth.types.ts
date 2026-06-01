import type { CurrentUser, LoginResponse } from "@knowflow/shared";

export type AuthenticatedUser = CurrentUser;

export type ApiSuccess<T> = {
  ok: true;
  data: T;
};

export type AuthLoginSuccess = ApiSuccess<LoginResponse>;

export type AuthMeSuccess = ApiSuccess<CurrentUser>;

export type EmptySuccess = ApiSuccess<Record<string, never>>;

export type RequestLike = {
  headers: {
    cookie?: string | string[];
    "user-agent"?: string | string[];
    "x-forwarded-for"?: string | string[];
  };
  socket?: {
    remoteAddress?: string;
  };
  ip?: string;
};

export type ResponseLike = {
  setHeader: (name: string, value: string | string[]) => void;
};
