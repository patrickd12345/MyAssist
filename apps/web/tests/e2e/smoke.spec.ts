import { expect, test } from "@playwright/test";

test("home renders MyAssist shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("MyAssist").first()).toBeVisible();
  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible();
});
