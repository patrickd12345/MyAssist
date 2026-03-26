import { expect, test } from "@playwright/test";

test("Job Hunt tab navigates to cockpit", async ({ page }) => {
  const email = `e2e-jh-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("link", { name: "Job Hunt" }).first().click();

  await expect(page.getByRole("heading", { name: "Job Hunt Cockpit" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
});
