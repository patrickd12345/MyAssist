import { expect, test } from "@playwright/test";

test("password sign-in submits through Supabase and navigates", async ({ page }) => {
  await page.route("**/auth/v1/token**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "token",
        refresh_token: "refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: "bearer",
        user: {
          id: "user-1",
          aud: "authenticated",
          role: "authenticated",
          email: "e2e@example.com",
        },
      }),
    });
  });

  await page.goto("/sign-in");
  await page.getByTestId("email-input").fill("e2e@example.com");
  await page.getByTestId("password-input").fill("testpass1234");
  await page.getByTestId("submit-button").click();

  await expect(page).toHaveURL("/");
  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({ timeout: 30_000 });
});
