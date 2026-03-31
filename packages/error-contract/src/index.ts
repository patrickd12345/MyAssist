export type CanonicalError = {
  code: string;
  message: string;
  requestId: string;
  details?: string;
};

export type RequestIdSource =
  | string
  | Headers
  | Request
  | { headers?: Headers | { get(name: string): string | null } }
  | undefined;

export type ToHttpErrorOptions = {
  fallbackCode: string;
  fallbackMessage: string;
  fallbackStatus: number;
  requestId?: string;
};

function headerGet(
  h: Headers | { get(name: string): string | null } | undefined,
  name: string,
): string | null {
  if (!h || typeof h.get !== "function") return null;
  return h.get(name);
}

export function getOrCreateRequestId(source?: RequestIdSource): string {
  if (typeof source === "string" && source.trim()) return source.trim();
  if (source instanceof Request) {
    const fromHeader = headerGet(source.headers, "x-request-id") || headerGet(source.headers, "X-Request-Id");
    if (fromHeader?.trim()) return fromHeader.trim();
  }
  if (source && typeof source === "object" && "headers" in source && source.headers) {
    const fromHeader =
      headerGet(source.headers as Headers, "x-request-id") ||
      headerGet(source.headers as Headers, "X-Request-Id");
    if (fromHeader?.trim()) return fromHeader.trim();
  }
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}`;
}

export function buildError(
  code: string,
  message: string,
  details?: string,
  requestId?: string,
): CanonicalError {
  const rid = requestId?.trim() || getOrCreateRequestId();
  return details ? { code, message, requestId: rid, details } : { code, message, requestId: rid };
}

export function toHttpError(
  error: unknown,
  options?: ToHttpErrorOptions,
): { code: string; message: string; status?: number } {
  const o = options ?? {
    fallbackCode: "internal_error",
    fallbackMessage: "Unknown error",
    fallbackStatus: 500,
  };
  if (error instanceof Error && error.message.trim()) {
    return {
      code: o.fallbackCode,
      message: error.message,
      status: o.fallbackStatus,
    };
  }
  return {
    code: o.fallbackCode,
    message: o.fallbackMessage,
    status: o.fallbackStatus,
  };
}
