type CookieOptions = {
  httpOnly: boolean;
  maxAgeSeconds: number;
  path: string;
  sameSite: "Lax" | "Strict" | "None";
  secure: boolean;
};

export function parseCookieHeader(cookieHeader: string | undefined): Record<string, string> {
  if (cookieHeader === undefined || cookieHeader.trim() === "") {
    return {};
  }

  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    try {
      const name = decodeURIComponent(separator === -1 ? trimmed : trimmed.slice(0, separator));
      cookies[name] = separator === -1 ? "" : decodeURIComponent(trimmed.slice(separator + 1));
    } catch {
      continue;
    }
  }

  return cookies;
}

export function serializeCookie(name: string, value: string, options: CookieOptions): string {
  const segments = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Max-Age=${String(options.maxAgeSeconds)}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`,
  ];

  if (options.httpOnly) {
    segments.push("HttpOnly");
  }

  if (options.secure) {
    segments.push("Secure");
  }

  return segments.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", {
    httpOnly: true,
    maxAgeSeconds: 0,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}

export function serializeCsrfCookie(name: string, token: string, secure: boolean): string {
  return serializeCookie(name, token, {
    httpOnly: false,
    maxAgeSeconds: 15 * 60,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}

export function clearCsrfCookie(name: string, secure: boolean): string {
  return serializeCookie(name, "", {
    httpOnly: false,
    maxAgeSeconds: 0,
    path: "/",
    sameSite: "Lax",
    secure,
  });
}
