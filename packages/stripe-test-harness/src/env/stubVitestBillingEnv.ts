import type { VitestUtils } from "vitest";

/** Default env for MyAssist billing route handler Vitest suites */
export function stubDefaultBillingRouteEnv(vi: VitestUtils): void {
  vi.stubEnv("BILLING_ENABLED", "true");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");
  vi.stubEnv("NODE_ENV", "test");
}

export function stubProductionLikeBillingMisconfiguredEnv(vi: VitestUtils): void {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("STRIPE_SECRET_KEY", "");
  vi.stubEnv("BILLING_ENABLED", "true");
}
