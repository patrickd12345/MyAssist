import "server-only";

export type ServerLogLevel = "info" | "warn" | "error";

/**
 * Minimal structured logs for API routes and server services (no PII beyond operational ids).
 */
export function logServerEvent(
  level: ServerLogLevel,
  event: string,
  fields: Record<string, string | number | boolean | undefined | null> = {},
): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.info(line);
  }
}
