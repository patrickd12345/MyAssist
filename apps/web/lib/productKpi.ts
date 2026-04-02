import "server-only";

import { logServerEvent } from "./serverLog";

/**
 * Product KPI events (see docs/product-kpis.md).
 * Names use prefix `myassist_kpi_` for log filtering; avoid PII in fields.
 */
export function logKpiDailyContextServed(fields: {
  source: string;
  duration_ms: number;
  path: "session" | "mcp_bearer";
}): void {
  logServerEvent("info", "myassist_kpi_daily_context_served", {
    context_source: fields.source,
    duration_ms: fields.duration_ms,
    path: fields.path,
  });
}

export function logKpiProviderAction(fields: {
  provider: "todoist" | "gmail" | "google_calendar" | "cross_system";
  action: string;
  ok: boolean;
  status?: number;
}): void {
  logServerEvent("info", "myassist_kpi_provider_action", {
    provider: fields.provider,
    action: fields.action,
    ok: fields.ok,
    ...(fields.status !== undefined ? { http_status: fields.status } : {}),
  });
}

export function logKpiMcpDailyContext(fields: { duration_ms: number; ok: boolean }): void {
  logServerEvent("info", "myassist_kpi_mcp_daily_context", {
    duration_ms: fields.duration_ms,
    ok: fields.ok,
  });
}
