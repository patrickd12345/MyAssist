import "server-only";
import { logServerEvent } from "@/lib/serverLog";

function isOAuthDebugEnabled(): boolean {
  const v = process.env.MYASSIST_DEBUG_OAUTH?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Session debug — OAuth flow only; no secrets. Off unless `MYASSIST_DEBUG_OAUTH` is set. */
export function oauthDebugLog(input: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  runId?: string;
}): void {
  if (!isOAuthDebugEnabled()) {
    return;
  }
  const body = {
    sessionId: "f4d498",
    hypothesisId: input.hypothesisId,
    runId: input.runId ?? "pre-fix",
    location: input.location,
    message: input.message,
    data: input.data,
    timestamp: Date.now(),
  };
  logServerEvent("info", "myassist_debug_oauth", { payload: JSON.stringify(body) });
  fetch("http://127.0.0.1:7538/ingest/febd9a03-add3-4714-bff3-bb76cbeaeb9d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f4d498" },
    body: JSON.stringify({ ...body, sessionId: "f4d498" }),
  }).catch(() => {});
}
