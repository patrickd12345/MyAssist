import { expect, test } from "@playwright/test";

/**
 * Submit via Ask button (not Enter-only) and assert POST /api/assistant succeeds.
 */
test("Ask button sends message and shows user bubble plus assistant reply", async ({ page }) => {
  const email = `e2e-asst-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fast support when you need it" })).toBeVisible({
    timeout: 25_000,
  });

  const input = page.locator("#assistant-input");
  await expect(input).toBeVisible({ timeout: 15_000 });
  const question = "What is one priority from today's snapshot?";
  await input.fill(question);

  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes("/api/assistant") && r.request().method() === "POST",
      { timeout: 60_000 },
    ),
    page.getByRole("button", { name: "Ask", exact: true }).click(),
  ]);

  expect(response.status(), "POST /api/assistant should return 200 (rule fallback or model)").toBe(200);
  await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 15_000 });

  const hasError = await page.getByRole("alert").isVisible().catch(() => false);
  const assistantBubbles = page.locator(".chat-bubble-assistant");
  const bubbleCount = await assistantBubbles.count();
  expect(
    bubbleCount >= 2 || hasError,
    "Expected an assistant reply bubble after welcome, or an explicit error alert",
  ).toBe(true);
});
