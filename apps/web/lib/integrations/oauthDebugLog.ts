import "server-only";

/** Session debug — OAuth flow only; no secrets. */
// #region agent log
export function oauthDebugLog(input: {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  runId?: string;
}): void {
  const body = {
    sessionId: "f4d498",
    hypothesisId: input.hypothesisId,
    runId: input.runId ?? "pre-fix",
    location: input.location,
    message: input.message,
    data: input.data,
    timestamp: Date.now(),
  };
  console.error("[MYASSIST_DEBUG_OAUTH]", JSON.stringify(body));
  fetch("http://127.0.0.1:7538/ingest/febd9a03-add3-4714-bff3-bb76cbeaeb9d", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "f4d498" },
    body: JSON.stringify({ ...body, sessionId: "f4d498" }),
  }).catch(() => {});
}
// #endregion
