import { expect, test } from "@playwright/test";

const e2ePort = process.env.PLAYWRIGHT_WEB_PORT ?? "3005";
const e2eBase = `http://127.0.0.1:${e2ePort}`;

test("OAuth authorize redirect_to points at this app auth callback, not a bookiji default", async ({
  page,
}) => {
  let redirectTo: string | null = null;
  await page.route("https://supabase.test/auth/v1/authorize**", (route) => {
    const u = new URL(route.request().url());
    redirectTo = u.searchParams.get("redirect_to");
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/sign-in?callbackUrl=%2Ftasks");
  await page.getByTestId("oauth-google").click();

  await expect.poll(() => redirectTo, { timeout: 15_000 }).toBeTruthy();
  expect(redirectTo!).toContain("/auth/callback");
  expect(redirectTo).toContain(`${e2eBase}/auth/callback`);
  expect(redirectTo).not.toMatch(/bookiji/i);
  expect(redirectTo).toMatch(/callbackUrl=%2Ftasks/);
});
