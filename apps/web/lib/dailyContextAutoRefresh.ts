import type { MyAssistDailyContext } from "@/lib/types";

const DEFAULT_STALE_MS = 10 * 60 * 1000;
const MIN_STALE_MS = 60_000;
const MAX_STALE_MS = 24 * 60 * 60 * 1000;

/** Poll interval for staleness checks while the tab is visible (separate from stale age). */
export const AUTO_REFRESH_POLL_INTERVAL_MS = 5 * 60 * 1000;

export type IntegrationLike = { provider: string; status: string };

/**
 * Client-only: milliseconds after `generated_at` after which context is considered stale for auto-refresh.
 * Set `NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS` (e.g. 300000 for 5 minutes).
 */
export function getAutoRefreshStaleMs(): number {
  if (typeof process === "undefined" || !process.env?.NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS) {
    return DEFAULT_STALE_MS;
  }
  const raw = Number.parseInt(process.env.NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS.trim(), 10);
  if (!Number.isFinite(raw) || raw < MIN_STALE_MS) return DEFAULT_STALE_MS;
  return Math.min(raw, MAX_STALE_MS);
}

export function isDailyContextStale(
  context: Pick<MyAssistDailyContext, "generated_at"> | null,
  nowMs: number,
  staleMs: number,
): boolean {
  if (!context?.generated_at?.trim()) return true;
  const t = Date.parse(context.generated_at);
  if (Number.isNaN(t)) return true;
  return nowMs - t > staleMs;
}

export function hasAnyConnectedIntegration(providers: IntegrationLike[]): boolean {
  return providers.some((p) => p.status === "connected");
}
