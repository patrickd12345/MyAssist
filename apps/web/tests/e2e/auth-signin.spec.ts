import { expect, test } from "@playwright/test";

test("register completes and dashboard shows welcome", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
});
