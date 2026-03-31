export type AiLogMetadata = {
  provider?: string;
  model?: string;
  mode?: string;
  latencyMs?: number;
};

function headerGet(
  h: Headers | { get(name: string): string | null } | undefined,
  name: string,
): string | null {
  if (!h || typeof h.get !== "function") return null;
  return h.get(name);
}

export function getRequestId(source?: string | Headers | Request): string {
  if (typeof source === "string" && source.trim()) return source.trim();
  if (source instanceof Request) {
    const v = headerGet(source.headers, "x-request-id") || headerGet(source.headers, "X-Request-Id");
    if (v?.trim()) return v.trim();
  }
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}`;
}

export function emitStructuredLog(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, string | number | boolean | undefined | null>,
): void {
  const line = { event, ...fields };
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}

export function emitAiLog(
  level: "info" | "warn" | "error",
  event: string,
  metadata: AiLogMetadata,
  fields: Record<string, string | number | boolean | undefined | null>,
): void {
  emitStructuredLog(level, event, { ...metadata, ...fields } as Record<
    string,
    string | number | boolean | undefined | null
  >);
}
