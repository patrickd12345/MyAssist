import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eUserStore = path.join(process.cwd(), "tests", "e2e", ".playwright-users.json");
const e2ePort = process.env.PLAYWRIGHT_WEB_PORT ?? "3005";
const e2eOrigin = `http://localhost:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
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
    command: `pnpm exec next dev -H localhost -p ${e2ePort}`,
    url: e2eOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MYASSIST_USE_MOCK_CONTEXT: "true",
      AUTH_SECRET: "playwright-test-auth-secret-at-least-32-characters-long",
      AUTH_URL: `${e2eOrigin}/api/auth`,
      AUTH_TRUST_HOST: "true",
      MYASSIST_USER_STORE_FILE: e2eUserStore,
    },
  },
});
