import { expect, test } from "@playwright/test";
import { registerViaPasswordUi } from "./helpers/registerViaPasswordUi";

test("Job Hunt tab navigates to cockpit", async ({ page }) => {
  const email = `e2e-jh-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await registerViaPasswordUi(page, email, password);

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  await Promise.all([
    page.waitForURL("**/job-hunt", { timeout: 45_000 }),
    page.getByRole("link", { name: "Job Hunt" }).first().click(),
  ]);

  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible({
    timeout: 45_000,
  });
  await expect(page.getByRole("heading", { name: /Job Hunt/i })).toBeVisible({
    timeout: 45_000,
  });
});
