type RequestWithClientIp = {
  headers: Record<string, string | string[] | undefined>;
  socket?: {
    remoteAddress?: string;
  };
  ip?: string;
};

export function shouldTrustProxy(): boolean {
  return ["1", "true", "yes"].includes((process.env["TRUST_PROXY"] ?? "").toLowerCase());
}

export function getClientIp(request: RequestWithClientIp): string | null {
  if (shouldTrustProxy()) {
    const forwarded = getHeader(request, "x-forwarded-for");
    const forwardedIp = forwarded
      ?.split(",")
      .map((part) => part.trim())
      .find((part) => part.length > 0);
    if (forwardedIp !== undefined) {
      return forwardedIp;
    }
  }

  return request.ip ?? request.socket?.remoteAddress ?? null;
}

function getHeader(request: RequestWithClientIp, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()] ?? request.headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
