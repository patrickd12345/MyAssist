# MyAssist product KPIs

Single-user and pilot metrics aligned with the strategic plan: measure operational value (speed, reliability, habit), not raw chat quality.

## KPI definitions

| KPI | Definition | Target direction | Primary signal |
| --- | --- | --- | --- |
| **Time-to-first-action (TTFA)** | Seconds from first meaningful Today load (daily context ready) to first successful provider or cross-system action in that session | Lower | Client timer + `myassist_kpi_daily_context_served` then first `myassist_kpi_provider_action` with `ok: true` in same session (session id TBD) |
| **Weekly active days (WAD)** | Distinct calendar days per week where the user opened Today or received a successful `daily_context_served` | Higher | Analytics backend or aggregated logs |
| **Action success rate** | `ok: true` / all `myassist_kpi_provider_action` events for a period, by provider | Higher | `myassist_kpi_provider_action` |
| **Daily context latency** | `duration_ms` on `myassist_kpi_daily_context_served` (server time to build full context) | Lower p95 | Structured logs |

## Where events are logged

All KPI events go through `@bookiji-inc/observability` via `logServerEvent` in [`apps/web/lib/serverLog.ts`](../apps/web/lib/serverLog.ts), using helpers in [`apps/web/lib/productKpi.ts`](../apps/web/lib/productKpi.ts).

| Event name | When | Fields |
| --- | --- | --- |
| `myassist_kpi_daily_context_served` | After successful `GET /api/daily-context` (session cookie) | `context_source`, `duration_ms`, `path: session` |
| `myassist_kpi_mcp_daily_context` | After `GET /api/mcp/daily-context` (bearer token) | `duration_ms`, `ok` |
| `myassist_kpi_provider_action` | After Todoist complete (initial wiring) | `provider`, `action`, `ok`, optional `http_status` |

## Future instrumentation

- **TTFA**: add optional `POST /api/kpi/session` or `navigator.sendBeacon` with `session_id`, `event: context_ready|first_action`, `client_ts` (no email content).
- **Top-3 usefulness**: log when user completes an action that matches a surfaced priority (requires stable priority ids in the payload).

## Privacy

KPI fields must remain non-identifying: no message bodies, no tokens, no raw email subjects in metric labels.
