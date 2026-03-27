import { expect, test } from "@playwright/test";

test("forgot-password flow resets credentials and allows sign-in", async ({ page }) => {
  const email = `e2e-reset-${Date.now()}@example.com`;
  const originalPassword = "testpass1234";
  const updatedPassword = "updated-pass-123";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(originalPassword);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If this email exists, reset instructions were sent.")).toBeVisible();
  const resetHref = await page.getByRole("link", { name: "Open reset link (dev)" }).getAttribute("href");
  expect(resetHref).toContain("token=");
  await page.goto(resetHref as string);
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();

  await page.locator("#reset-password").fill(updatedPassword);
  await page.locator("#reset-password-confirm").fill(updatedPassword);
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page).toHaveURL(/\/sign-in/, { timeout: 30_000 });

  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(updatedPassword);
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
});

test("invalid and missing reset-token states are handled", async ({ page }) => {
  await page.goto("/reset-password?token=invalid-token");
  await page.locator("#reset-password").fill("new-invalid-pass-123");
  await page.locator("#reset-password-confirm").fill("new-invalid-pass-123");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Invalid or expired reset link.")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByText("Invalid reset link. Request a new one.")).toBeVisible();
});
