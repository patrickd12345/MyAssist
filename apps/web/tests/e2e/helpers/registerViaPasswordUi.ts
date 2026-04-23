import { expect, type Page } from "@playwright/test";

/** Sign-in UI defaults to magic link; password registration lives under Email & password. */
export async function registerViaPasswordUi(page: Page, email: string, password: string): Promise<void> {
  await page.getByTestId("pw-mode-sign-in").waitFor({ state: "visible" });
  const registerMode = page.getByTestId("pw-mode-register");
  await registerMode.dispatchEvent("click");
  try {
    await expect(page.getByTestId("submit-button")).toHaveText("Create account", { timeout: 10_000 });
  } catch {
    await registerMode.click({ force: true });
    await expect(page.getByTestId("submit-button")).toHaveText("Create account", { timeout: 10_000 });
  }
  await page.getByTestId("email-input").fill(email);
  await page.getByTestId("password-input").fill(password);
  await expect(page.getByTestId("submit-button")).toBeEnabled();
  await page.getByTestId("submit-button").click();
  // E2E webServer uses MYASSIST_AUTH_DISABLED: the server session is always "signed in", but the
  // Supabase browser client may not get a session from the test project; open / to load the dashboard.
  await page.goto("/", { waitUntil: "domcontentloaded" });
}
