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

  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) {
          return [part, ""];
        }
        return [
          decodeURIComponent(part.slice(0, separator)),
          decodeURIComponent(part.slice(separator + 1)),
        ];
      }),
  );
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
