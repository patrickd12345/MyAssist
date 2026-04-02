import { expect, test } from "@playwright/test";

/**
 * E2E webServer does not set BILLING_ENABLED; billing panel should stay off and status API should report disabled.
 */
test.describe("Billing status and UI (default env)", () => {
  test("GET /api/billing/status returns enabled: false", async ({ request }) => {
    const res = await request.get("/api/billing/status");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { enabled?: boolean };
    expect(body.enabled).toBe(false);
  });

  test("dashboard does not show Subscription actions when billing is off", async ({ page }) => {
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

    await expect(page.getByRole("button", { name: "Subscribe / upgrade" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Manage billing" })).toHaveCount(0);
  });
});
