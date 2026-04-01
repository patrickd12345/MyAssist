import { expect, test } from "@playwright/test";

/**
 * Structured sanity pass: register once, then check APIs and each dashboard tab.
 * Playwright webServer sets MYASSIST_USE_MOCK_CONTEXT=true — inbox should show mock Gmail rows.
 */
test.describe("Dashboard sanity (E2E server + mock daily context)", () => {
  test("APIs and tabs: integrations status, daily context, Overview → Tasks → Inbox → Calendar → Assistant", async ({
    page,
  }) => {
    const email = `sanity-${Date.now()}@example.com`;
    const password = "testpass1234";

    await test.step("Register and land on dashboard", async () => {
      await page.goto("/sign-in");
      await page.getByRole("button", { name: "Register" }).click();
      await page.getByLabel("Email").fill(email);
      await page.locator("#sign-in-password").fill(password);
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("OAuth return query: banner visible and search params stripped", async () => {
      await page.goto("/?integrations=connected&provider=google");
      await expect(page.getByText(/OAuth completed/)).toBeVisible({ timeout: 15_000 });
      await expect(page).not.toHaveURL(/integrations=/);
    });

    await test.step("GET /api/integrations/status", async () => {
      const res = await page.request.get("/api/integrations/status");
      expect(res.status(), "integrations status should be 200 when signed in").toBe(200);
      const body = (await res.json()) as { providers?: unknown };
      expect(Array.isArray(body.providers), "response should include providers[]").toBe(true);
    });

    await test.step("GET /api/daily-context (live path uses mock when MYASSIST_USE_MOCK_CONTEXT=true)", async () => {
      const res = await page.request.get("/api/daily-context");
      expect(res.status(), "daily-context should return 200").toBe(200);
      const json = (await res.json()) as {
        gmail_signals?: unknown[];
        calendar_today?: unknown[];
        todoist_overdue?: unknown[];
      };
      expect(Array.isArray(json.gmail_signals), "gmail_signals should be an array").toBe(true);
      expect(json.gmail_signals!.length, "mock context should include at least one gmail signal").toBeGreaterThan(0);
      expect(Array.isArray(json.calendar_today), "calendar_today should be an array").toBe(true);
      expect(Array.isArray(json.todoist_overdue), "todoist_overdue should be an array").toBe(true);
    });

    await test.step("Overview: headline region and primary panels", async () => {
      await expect(page.getByRole("button", { name: "Overview", exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Rule-based snapshot").first()).toBeVisible({ timeout: 25_000 });
      await expect(page.getByLabel("Unified daily briefing").first()).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel("Daily intelligence").first()).toBeVisible({ timeout: 10_000 });
    });

    await test.step("Tasks tab", async () => {
      await page.getByRole("button", { name: "Tasks", exact: true }).click();
      await expect(
        page.getByRole("heading", { name: "Todoist lists" }).or(page.getByText("No snapshot on disk yet")),
      ).toBeVisible({ timeout: 20_000 });
    });

    await test.step("Inbox tab: heading + mock email row visible under mock context", async () => {
      await page.getByRole("button", { name: "Inbox", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Email in this pull" })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByText("Example signal (mock)").first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Calendar tab", async () => {
      await page.getByRole("button", { name: "Calendar", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Today and next" })).toBeVisible({
        timeout: 20_000,
      });
    });

    await test.step("Assistant tab shell", async () => {
      await page.getByRole("button", { name: "Assistant", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Fast support when you need it" })).toBeVisible({
        timeout: 20_000,
      });
    });
  });
});
