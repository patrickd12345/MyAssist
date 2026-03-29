import "server-only";
import {
  emitAiLog,
  emitStructuredLog,
  getRequestId,
  type AiLogMetadata,
} from "@bookiji-inc/observability";

export type ServerLogLevel = "info" | "warn" | "error";

/**
 * Minimal structured logs for API routes and server services (no PII beyond operational ids).
 */
export function logServerEvent(
  level: ServerLogLevel,
  event: string,
  fields: Record<string, string | number | boolean | undefined | null> = {},
): void {
  emitStructuredLog(level, event, fields);
}

export function logAiServerEvent(
  event: string,
  metadata: AiLogMetadata,
  fields: Record<string, string | number | boolean | undefined | null> = {},
): void {
  emitAiLog("info", event, metadata, fields);
}

export function getServerRequestId(source?: string | Headers | Request): string {
  return getRequestId(source);
}
