/** Shared client/server-safe constants for daily context (no Node APIs). */

export type DailyContextSource = "n8n" | "mock" | "cache";

/** Response header on `/api/daily-context`: `n8n`, `mock`, or `cache` (body stays pure JSON for Custom GPT). */
export const MYASSIST_CONTEXT_SOURCE_HEADER = "x-myassist-context-source";
