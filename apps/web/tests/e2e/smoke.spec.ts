import { expect, test } from "@playwright/test";

test("sign-in page renders MyAssist shell", async ({ page }) => {
  await page.goto("/sign-in");
  await expect(page.getByText("MyAssist").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});
