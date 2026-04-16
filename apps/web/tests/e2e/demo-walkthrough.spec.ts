import { expect, test, type Page } from "@playwright/test";

test.use({
  video: "on",
  trace: "on",
  viewport: { width: 1512, height: 920 },
});

async function registerAndOpenDashboard(page: Page) {
  const email = `demo-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.waitForTimeout(700);

  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });
}

async function refreshContextIfNeeded(page: Page) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await page.getByText("Rule-based snapshot").isVisible()) {
      break;
    }
    const refreshLive = page.getByRole("button", { name: "Refresh live context" });
    const refresh = page.getByRole("button", { name: "Refresh", exact: true }).first();
    if (await refreshLive.isVisible()) {
      await refreshLive.click();
    } else if (await refresh.isVisible()) {
      await refresh.click();
    }
    await page.waitForTimeout(1200);
  }

  await expect(page.getByRole("button", { name: "Overview", exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(900);
}

test("single complete app walkthrough (video demo)", async ({ page }) => {
  test.slow();
  test.setTimeout(120_000);

  await registerAndOpenDashboard(page);
  await refreshContextIfNeeded(page);

  await expect(page.getByRole("region", { name: "Recent MyAssist actions" })).toBeVisible();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page
      .getByRole("heading", { name: "Todoist lists" })
      .or(page.getByText("No snapshot on disk yet"))
      .first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(900);

  if (await page.getByRole("button", { name: "Complete" }).first().isVisible()) {
    await page.getByRole("button", { name: "Complete" }).first().click();
    await page.waitForTimeout(900);
  }

  await page.getByRole("button", { name: "Inbox", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Email in this pull" })).toBeVisible();
  await page.waitForTimeout(900);

  const toTodoist = page.getByRole("button", { name: "To Todoist" }).first();
  if (await toTodoist.isVisible()) {
    await toTodoist.click();
    await page.waitForTimeout(1200);
  }

  const draftReply = page.getByRole("button", { name: "Draft reply" }).first();
  if (await draftReply.isVisible()) {
    await draftReply.click();
    await page.waitForTimeout(900);
  }

  await page.getByRole("button", { name: "Assistant", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Fast support when you need it" })).toBeVisible();
  await page.getByLabel("Ask MyAssist").fill("Summarize my day in one sentence and one next step.");
  await page.locator("form").getByRole("button", { name: "Ask" }).click();
  await page.waitForTimeout(1400);

  await page.getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Today and next" })).toBeVisible();
  await page.waitForTimeout(900);

  await page.getByRole("button", { name: "Overview", exact: true }).click();
  await expect(page.getByText("Rule-based snapshot").first()).toBeVisible();
  await page.waitForTimeout(900);

  const jobHuntLink = page.getByRole("link", { name: "Job Hunt" }).first();
  await jobHuntLink.scrollIntoViewIfNeeded();
  await jobHuntLink.click();
  await page.waitForURL("**/job-hunt", { timeout: 60_000 });
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await page.waitForTimeout(1300);

  const backToMyAssist = page.getByRole("link", { name: "Back to MyAssist" });
  if (await backToMyAssist.isVisible()) {
    await backToMyAssist.click();
  }
  // SPA back link can leave navigation pending for "load"; hard navigate home for stable e2e.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.waitForTimeout(700);
});
