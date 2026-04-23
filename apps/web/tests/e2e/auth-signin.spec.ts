import { expect, test } from "@playwright/test";

test("magic link request completes and shows confirmation", async ({ page }) => {
  await page.route("**/auth/v1/otp**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto("/sign-in");
  await page.getByTestId("email-input").fill("e2e@example.com");
  await page.getByTestId("magic-link-button").click();

  await expect(page.getByTestId("success-message")).toContainText(/Magic link sent/i, { timeout: 15_000 });
});
