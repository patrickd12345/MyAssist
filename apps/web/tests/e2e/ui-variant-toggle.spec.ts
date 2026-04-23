import { expect, test } from "@playwright/test";
import { registerViaPasswordUi } from "./helpers/registerViaPasswordUi";

test.describe("UI variant toggle", () => {
  test("api persistence + query override work for ui variants", async ({ page }) => {
    const email = `variant-${Date.now()}@example.com`;
    const password = "testpass1234";

    await page.goto("/sign-in");
    await registerViaPasswordUi(page, email, password);
    await expect(page.getByTestId("ui-variant-toggle")).toBeVisible({ timeout: 20_000 });

    const res = await page.request.post("/api/ui-variant", {
      data: { variant: "refactor" },
    });
    expect(res.status()).toBe(200);

    await page.goto("/");
    await expect(page.getByText("Refactor preview is enabled.")).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText("Refactor preview is enabled.")).toBeVisible({ timeout: 15_000 });

    await page.goto("/?ui=classic");
    await expect(page.getByText("Refactor preview is enabled.")).not.toBeVisible({ timeout: 15_000 });
  });
});
