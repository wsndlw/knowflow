"use client";

import {
  apiFailureSchema,
  apiSuccessSchema,
  CSRF_HEADER_NAME,
  currentUserSchema,
  loginRequestSchema,
  loginResponseSchema,
  type CurrentUser,
  type LoginRequest,
} from "@knowflow/shared";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiUrl, getCsrfToken, refreshAccess, resetRefreshState } from "../lib/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: CurrentUser | null;
  login: (input: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const meResponseSchema = apiSuccessSchema(currentUserSchema);
const loginSuccessSchema = apiSuccessSchema(loginResponseSchema);

async function parseError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const parsed = apiFailureSchema.safeParse(body);
    return parsed.success ? parsed.data.error.message : "Request failed";
  } catch {
    return "Request failed";
  }
}

async function fetchMe(): Promise<CurrentUser | null> {
  const response = await fetch(apiUrl("/auth/me"), {
    credentials: "include",
    cache: "no-store",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  const body: unknown = await response.json();
  return meResponseSchema.parse(body).data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<CurrentUser | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const loadMe = useCallback(async () => {
    setStatus("loading");
    try {
      const current = await fetchMe();
      if (current !== null) {
        setUser(current);
        setStatus("authenticated");
        return;
      }

      if (await refreshAccess()) {
        const refreshed = await fetchMe();
        if (refreshed !== null) {
          setUser(refreshed);
          setStatus("authenticated");
          return;
        }
      }
    } catch {
      setUser(null);
    }

    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      router.replace("/login");
    }
    if (status === "authenticated" && pathname === "/login") {
      router.replace("/");
    }
  }, [pathname, router, status]);

  const login = useCallback(async (input: LoginRequest) => {
    const payload = loginRequestSchema.parse(input);
    const response = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const body: unknown = await response.json();
    const parsed = loginSuccessSchema.parse(body);
    setUser(parsed.data.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(apiUrl("/auth/logout"), {
        method: "POST",
        headers: {
          [CSRF_HEADER_NAME]: getCsrfToken(),
        },
        credentials: "include",
      });
    } finally {
      // 即使登出请求失败，也清空前端会话状态并跳登录，避免卡在已登录态
      resetRefreshState();
      setUser(null);
      setStatus("unauthenticated");
      router.replace("/login");
    }
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      login,
      logout,
      refreshMe: loadMe,
    }),
    [loadMe, login, logout, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
