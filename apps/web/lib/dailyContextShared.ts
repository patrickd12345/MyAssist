/** Shared client/server-safe constants for daily context (no Node APIs). */

export type DailyContextSource = "live" | "mock" | "demo" | "cache";

/** Response header on `/api/daily-context`: `live`, `mock`, or `cache` (body stays pure JSON for Custom GPT). */
export const MYASSIST_CONTEXT_SOURCE_HEADER = "x-myassist-context-source";

/** Client `fetch` timeout for `/api/daily-context` so Refresh cannot spin indefinitely if the route stalls. */
export const DAILY_CONTEXT_CLIENT_FETCH_TIMEOUT_MS = 180_000;
