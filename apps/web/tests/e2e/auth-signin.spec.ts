import { expect, test } from "@playwright/test";

test("register completes and dashboard shows welcome", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: /Welcome back/i }).first()).toBeVisible({
    timeout: 30_000,
  });
});
