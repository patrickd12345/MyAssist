import { expect, test, devices } from "@playwright/test";

test.use({ ...devices["Pixel 5"] });

/**
 * TaskList primary actions use min-h-11 (~44px) for touch; assert layout on narrow viewport.
 */
test("Complete button has at least 44px height (touch target)", async ({ page }) => {
  const email = `e2e-mob-${Date.now()}@example.com`;
  const password = "testpass1234";

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Register" }).click();
  await page.getByLabel("Email").fill(email);
  await page.locator("#sign-in-password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByText("Welcome back", { exact: false }).first()).toBeVisible({
    timeout: 30_000,
  });

  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Todoist lists" }).or(page.getByText("No snapshot on disk yet")),
  ).toBeVisible({ timeout: 25_000 });

  const completeButtons = page.getByRole("button", { name: "Complete", exact: true });
  const n = await completeButtons.count();
  if (n === 0) {
    test.skip(true, "No Complete button in this snapshot (empty or index-only tasks)");
  }

  const box = await completeButtons.first().boundingBox();
  expect(box, "Complete button should be laid out").toBeTruthy();
  expect(box!.height, "Touch target height >= 44px").toBeGreaterThanOrEqual(44);
});
