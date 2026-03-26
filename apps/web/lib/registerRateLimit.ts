const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_WINDOW = 10;

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function checkRegisterRateLimit(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  const key = ip.trim() || "unknown";
  let b = buckets.get(key);
  if (!b || now > b.resetAt) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, b);
  }
  if (b.count >= MAX_PER_WINDOW) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  b.count += 1;
  return { ok: true };
}

export function resetRegisterRateLimitForTests(): void {
  if (process.env.NODE_ENV === "test") {
    buckets.clear();
  }
}

export function clientIpFromRequest(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0]?.trim() ?? "unknown";
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
