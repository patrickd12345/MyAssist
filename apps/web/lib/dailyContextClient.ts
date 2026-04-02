import { DAILY_CONTEXT_CLIENT_FETCH_TIMEOUT_MS } from "./dailyContextShared";

/** Use with `fetch("/api/daily-context", dailyContextFetchInit())` in client components. */
export function dailyContextFetchInit(): RequestInit {
  const init: RequestInit = { cache: "no-store" };
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    init.signal = AbortSignal.timeout(DAILY_CONTEXT_CLIENT_FETCH_TIMEOUT_MS);
  }
  return init;
}
