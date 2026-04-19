import type { Page } from "@playwright/test";
import { authSelectors } from "./authSelectors";

export async function submitForgotPasswordFlow(page: Page, email: string) {
  await page.locator(authSelectors.forgotPasswordLink).click();
  await page.locator(authSelectors.emailInput).fill(email);
  await page.locator(authSelectors.resetPasswordButton).click();
  await page.waitForSelector(authSelectors.successMessage);
}

/** Use when already on `/forgot-password` (avoids needing the sign-in forgot link). */
export async function submitForgotPasswordFromForgotPasswordPage(page: Page, email: string) {
  await page.locator(authSelectors.emailInput).fill(email);
  await page.locator(authSelectors.resetPasswordButton).click();
  await page.waitForSelector(authSelectors.successMessage);
}

export function extractResetLinkFromEmail(htmlContent: string): string {
  const linkRegex = /href="(https?:\/\/[^"]+)"/;
  const match = linkRegex.exec(htmlContent);
  if (!match) throw new Error("Could not find reset link in email content");
  return match[1];
}

/** MyAssist dev-only anchor shown after forgot-password POST. */
export async function awaitDevResetLinkFromForgotPasswordPage(page: Page): Promise<string> {
  const href = await page.getByRole("link", { name: "Open reset link (dev)" }).getAttribute("href");
  if (!href || !href.includes("token=")) {
    throw new Error("Expected dev reset link with token query param");
  }
  return href;
}
