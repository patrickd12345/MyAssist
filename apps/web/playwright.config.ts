import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eUserStore = path.join(process.cwd(), "tests", "e2e", ".playwright-users.json");
const e2ePort = process.env.PLAYWRIGHT_WEB_PORT ?? "3005";
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

/** When `1`, dev server gets `BILLING_ENABLED=true` so `tests/e2e/billing-status.spec.ts` can assert the Subscription panel. Do not set in CI unless you intend to run only billing specs against a fresh server. */
const billingUiE2E = process.env.PLAYWRIGHT_BILLING_UI === "1";

export default defineConfig({
  testDir: "./tests/e2e",
  /** Long walks (demo video, post-registration hydration) can exceed 30s on cold dev. */
  timeout: 90_000,
  /** File-backed user store (`MYASSIST_USER_STORE_FILE`) is shared; parallel workers race and flake registration. */
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: e2eOrigin,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `cross-env NODE_OPTIONS=--max-old-space-size=6144 pnpm exec next dev -H 127.0.0.1 -p ${e2ePort}`,
    url: e2eOrigin,
    /**
     * Always start a fresh dev server for E2E.
     * Reusing existing local servers can leak stale env/config after interrupted runs.
     */
    reuseExistingServer: false,
    /** Cold Next.js startup/compile can exceed 2m on busy local machines. */
    timeout: 300_000,
    env: {
      MYASSIST_USE_MOCK_CONTEXT: "true",
      MYASSIST_AUTH_DISABLED: "true",
      /** Override `.env.local` invite gates so specs that POST `/api/auth/register` without `inviteCode` stay valid. */
      MYASSIST_REGISTRATION_INVITE_CODE: "",
      /**
       * Clear Supabase project env for this process so `isSupabaseHostedStorageEnabled()` is false
       * and `createUser` uses the file user store (see `lib/userStore.ts`). Otherwise `.env.local`
       * can point at Supabase and registration fails in E2E.
       */
      SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://supabase.test",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-test-key",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      AUTH_SECRET: "playwright-test-auth-secret-at-least-32-characters-long",
      AUTH_URL: e2eOrigin,
      MYASSIST_USER_STORE_FILE: e2eUserStore,
      ...(billingUiE2E
        ? {
            BILLING_ENABLED: "true",
            MYASSIST_STRIPE_PRICE_ID: "price_e2e_placeholder",
          }
        : {}),
    },
  },
});
