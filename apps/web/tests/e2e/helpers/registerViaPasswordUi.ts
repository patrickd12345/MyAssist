import type { Page } from "@playwright/test";

/** Sign-in UI defaults to magic link; password registration lives under Email & password. */
export async function registerViaPasswordUi(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId("pw-mode-sign-in").waitFor({ state: "visible" });
  await page.getByTestId("pw-mode-register").click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#pw-password").fill(password);
  await page.getByTestId("submit-button").click();
  // E2E webServer uses MYASSIST_AUTH_DISABLED: the server session is always "signed in", but the
  // Supabase browser client may not get a session from the test project; open / to load the dashboard.
  await page.goto("/", { waitUntil: "domcontentloaded" });
}
