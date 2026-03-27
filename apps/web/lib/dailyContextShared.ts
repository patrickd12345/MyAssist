/** Shared client/server-safe constants for daily context (no Node APIs). */

export type DailyContextSource = "live" | "mock" | "cache";

/** Response header on `/api/daily-context`: `live`, `mock`, or `cache` (body stays pure JSON for Custom GPT). */
export const MYASSIST_CONTEXT_SOURCE_HEADER = "x-myassist-context-source";
