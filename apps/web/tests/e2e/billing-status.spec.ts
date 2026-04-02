import { expect, test } from "@playwright/test";

/**
 * Default Playwright webServer does not set `BILLING_ENABLED` (CI and local `pnpm test:e2e`).
 * Set **`PLAYWRIGHT_BILLING_UI=1`** (see `playwright.config.ts`) to start Next with billing on and assert the Subscription panel.
 * After toggling, stop any existing dev server on the E2E port so env is picked up (`reuseExistingServer` in dev).
 */
const billingUiOn = process.env.PLAYWRIGHT_BILLING_UI === "1";

test.describe("Billing status and UI", () => {
  test("GET /api/billing/status matches billing env", async ({ request }) => {
    const res = await request.get("/api/billing/status");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { enabled?: boolean };
    expect(body.enabled).toBe(billingUiOn);
  });

  test("dashboard subscription affordances match billing env", async ({ page }) => {
    const email = `billing-ui-${Date.now()}@example.com`;
    const password = "testpass1234";

    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Register" }).click();
    await page.getByLabel("Email").fill(email);
    await page.locator("#sign-in-password").fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
      timeout: 30_000,
    });

    if (billingUiOn) {
      await expect(page.getByText("Subscription", { exact: false }).first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.getByRole("button", { name: "Subscribe / upgrade" })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("button", { name: "Manage billing" })).toBeVisible({
        timeout: 10_000,
      });
    } else {
      await expect(page.getByRole("button", { name: "Subscribe / upgrade" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
    }
  });
});
