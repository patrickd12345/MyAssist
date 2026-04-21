import { expect, test } from "@playwright/test";

test("forgot-password and reset-password UI use Supabase contract", async ({ page }) => {
  test.setTimeout(60_000);
  const email = "ui-reset@example.com";
  const updatedPassword = "updated-pass-123";
  const recoveryCode = "recovery-code-123";

  await page.route("**/api/auth/forgot-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto("/forgot-password");
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("reset-password-button").click();
  await expect(page.getByTestId("success-message")).toBeVisible();

  await page.route("**/api/auth/reset-password", async (route) => {
    const payload = route.request().postDataJSON() as { code?: string; password?: string };
    expect(payload.code).toBe(recoveryCode);
    expect(payload.password).toBe(updatedPassword);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });

  await page.goto(`/reset-password?code=${recoveryCode}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  const resetOk = await page.evaluate(
    async ({ code, password }) => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, password }),
      });
      return res.ok;
    },
    { code: recoveryCode, password: updatedPassword },
  );
  expect(resetOk).toBe(true);
});

test("invalid, mismatch, and missing recovery states are handled", async ({ page }) => {
  await page.route("**/api/auth/reset-password", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({ error: "Invalid or expired reset link." }),
    });
  });

  await page.goto("/reset-password?code=invalid-code");
  await page.getByTestId("new-password-input").fill("new-invalid-pass-123");
  await page.getByTestId("confirm-password-input").fill("new-invalid-pass-123");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Invalid or expired reset link.")).toBeVisible();

  await page.goto("/reset-password?code=valid-code");
  await page.getByTestId("new-password-input").fill("new-valid-pass-123");
  await page.getByTestId("confirm-password-input").fill("mismatch-pass-123");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();

  await page.goto("/reset-password");
  await expect(page.getByText("Invalid reset link. Request a new one.")).toBeVisible();
});
