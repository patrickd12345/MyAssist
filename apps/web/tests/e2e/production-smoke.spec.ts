import { expect, test, type APIResponse, type Page } from "@playwright/test";

const productionBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "";

const VERCEL_AUTH_WALL_PATTERNS = [
  /vercel authentication/i,
  /deployment protection/i,
  /password protection/i,
  /continue with vercel/i,
  /vercel sso/i,
];

const BLOCKING_ERROR_PATTERNS = [
  /application error/i,
  /internal server error/i,
  /this page could not be found/i,
  /an unexpected error has occurred/i,
  /runtime error/i,
  /unhandled error/i,
];

const LOCAL_SERVICE_PATTERNS = [
  /\blocalhost\b/i,
  /\b127\.0\.0\.1\b/,
  /\b0\.0\.0\.0\b/,
  /\[::1\]/,
  /\.local\b/i,
];

type OAuthSelfCheck = {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  passwordResetEnabled: boolean;
  authEnabled: boolean;
};

test.beforeAll(() => {
  expect(
    productionBaseUrl,
    "BLOCKED ON ENV: set PLAYWRIGHT_BASE_URL or NEXT_PUBLIC_SITE_URL before running production smoke.",
  ).toMatch(/^https?:\/\//);
  expect(
    productionBaseUrl,
    "BLOCKED ON DEPLOYMENT: production smoke must target a hosted URL, not a local development origin.",
  ).not.toMatch(/localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|\.local\b/i);
});

function recordRuntimeNetwork(page: Page) {
  const requests: string[] = [];
  const failedRequests: string[] = [];
  const serverResponses: Array<{ status: number; url: string }> = [];

  page.on("request", (request) => requests.push(request.url()));
  page.on("requestfailed", (request) => {
    failedRequests.push(`${request.failure()?.errorText ?? "requestfailed"} ${request.url()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      serverResponses.push({ status: response.status(), url: response.url() });
    }
  });

  return { requests, failedRequests, serverResponses };
}

async function expectNoVercelAuthWall(page: Page) {
  const bodyText = await page.locator("body").innerText({ timeout: 15_000 });
  for (const pattern of VERCEL_AUTH_WALL_PATTERNS) {
    expect(bodyText, `BLOCKED ON DEPLOYMENT: Vercel auth/deployment wall detected by ${pattern}.`).not.toMatch(
      pattern,
    );
  }
}

async function expectNoBlockingErrorUi(page: Page) {
  const bodyText = await page.locator("body").innerText({ timeout: 15_000 });
  for (const pattern of BLOCKING_ERROR_PATTERNS) {
    expect(bodyText, `FAIL: blocking error UI detected by ${pattern}.`).not.toMatch(pattern);
  }
}

async function expectNoLocalUrlsInPage(page: Page, networkUrls: string[]) {
  const domSurface = await page.evaluate(() => {
    const values: string[] = [document.body.innerText, document.documentElement.innerHTML];
    for (const element of Array.from(document.querySelectorAll("[href], [src], [action]"))) {
      for (const attr of ["href", "src", "action"]) {
        const value = element.getAttribute(attr);
        if (value) values.push(value);
      }
    }
    return values.join("\n");
  });

  for (const pattern of LOCAL_SERVICE_PATTERNS) {
    expect(domSurface, `BLOCKED ON ENV: local service URL leaked into rendered page by ${pattern}.`).not.toMatch(
      pattern,
    );
    expect(networkUrls.join("\n"), `BLOCKED ON ENV: local service URL leaked into network URLs by ${pattern}.`).not.toMatch(
      pattern,
    );
  }
}

async function parseJsonResponse(response: APIResponse, label: string): Promise<unknown> {
  const contentType = response.headers()["content-type"] ?? "";
  const text = await response.text();

  expect(contentType, `FAIL: ${label} should return JSON, received content-type "${contentType}".`).toContain(
    "application/json",
  );
  expect(text, `FAIL: ${label} should not return an empty body.`).not.toBe("");

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`FAIL: ${label} returned non-JSON body: ${text.slice(0, 200)}`);
  }
}

function expectObjectJson(value: unknown, label: string): asserts value is Record<string, unknown> {
  expect(value, `FAIL: ${label} should be a JSON object.`).toBeTruthy();
  expect(Array.isArray(value), `FAIL: ${label} should not be a JSON array.`).toBe(false);
  expect(typeof value, `FAIL: ${label} should be an object.`).toBe("object");
}

function expectControlledApiStatus(response: APIResponse, label: string) {
  const status = response.status();
  expect(status, `FAIL: ${label} must never return HTTP 500.`).not.toBe(500);
  expect(status, `FAIL: ${label} must not return uncontrolled 5xx.`).toBeLessThan(500);
  expect(
    status === 200 || (status >= 400 && status < 500),
    `FAIL: ${label} expected HTTP 200 or controlled 4xx, received ${status}.`,
  ).toBe(true);
}

function expectControlledErrorShape(body: Record<string, unknown>, label: string) {
  const hasCode = typeof body.code === "string" && body.code.length > 0;
  const hasMessage = typeof body.message === "string" && body.message.length > 0;
  expect(hasCode || hasMessage, `FAIL: ${label} controlled error should include code or message.`).toBe(true);
}

function expectAssistantShape(body: Record<string, unknown>, status: number) {
  if (status === 200) {
    expect(typeof body.mode, "FAIL: assistant 200 response should include mode.").toBe("string");
    expect(typeof body.answer, "FAIL: assistant 200 response should include answer.").toBe("string");
    expect(Array.isArray(body.actions), "FAIL: assistant 200 response should include actions array.").toBe(true);
    expect(Array.isArray(body.followUps), "FAIL: assistant 200 response should include followUps array.").toBe(true);
    expect(Object.prototype.hasOwnProperty.call(body, "taskDraft"), "FAIL: assistant 200 response should include taskDraft.").toBe(
      true,
    );
    return;
  }

  expectControlledErrorShape(body, "/api/assistant");
}

async function getOAuthSelfCheck(page: Page): Promise<OAuthSelfCheck | null> {
  const response = await page.request.get("/api/auth/oauth-self-check", {
    headers: { Accept: "application/json" },
  });

  if (response.status() >= 500) {
    throw new Error(`BLOCKED ON OAUTH: /api/auth/oauth-self-check returned HTTP ${response.status()}`);
  }
    if (!response.ok()) return null;

    const body = await parseJsonResponse(response, "/api/auth/oauth-self-check");
    expectObjectJson(body, "/api/auth/oauth-self-check response");
    expect(Object.keys(body).sort(), "FAIL: /api/auth/oauth-self-check should return the capability shape.").toEqual([
      "authEnabled",
      "googleEnabled",
      "microsoftEnabled",
      "passwordResetEnabled",
    ]);
    return body as OAuthSelfCheck;
}

test.describe("MYA-DEPLOY-006 production smoke", () => {
  test("app load has no Vercel auth wall, redirect loop, or local URL leak", async ({ page }) => {
    const network = recordRuntimeNetwork(page);
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) navigations.push(frame.url());
    });

    const response = await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    expect(response, "BLOCKED ON DEPLOYMENT: homepage navigation should produce a response.").toBeTruthy();
    expect(response?.status(), "FAIL: homepage should not return HTTP 500.").not.toBe(500);
    expect(response?.status(), "FAIL: homepage should not return uncontrolled 5xx.").toBeLessThan(500);

    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await expect(page.locator("body"), "FAIL: homepage should render a body.").toBeVisible();
    expect(navigations.length, `BLOCKED ON DEPLOYMENT: potential redirect loop: ${navigations.join(" -> ")}`).toBeLessThan(8);
    await expectNoVercelAuthWall(page);
    await expectNoBlockingErrorUi(page);
    expect(network.serverResponses, "FAIL: page load should not produce 5xx network responses.").toEqual([]);
    await expectNoLocalUrlsInPage(page, network.requests);
  });

  test("Supabase sign-in surface renders without using credentials", async ({ page }) => {
    const network = recordRuntimeNetwork(page);

    await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("email-input")).toBeVisible();
    await expect(page.getByTestId("password-input")).toBeVisible();
    await expect(page.getByTestId("submit-button")).toBeVisible();

    await expectNoVercelAuthWall(page);
    await expectNoBlockingErrorUi(page);
    expect(network.serverResponses, "FAIL: sign-in page should not produce 5xx network responses.").toEqual([]);
    await expectNoLocalUrlsInPage(page, network.requests);
  });

  test("OAuth buttons are present only when provider login is configured", async ({ page }) => {
    const selfCheck = await getOAuthSelfCheck(page);
    await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expectNoVercelAuthWall(page);

    if (selfCheck?.googleEnabled) {
      await expect(page.getByTestId("oauth-google"), "BLOCKED ON OAUTH: Google login is configured but the button is missing.").toBeVisible();
    } else {
      test.info().annotations.push({
        type: "informational",
        description: "Google login is disabled or unconfigured by production OAuth self-check.",
      });
    }

    if (selfCheck?.microsoftEnabled) {
      await expect(
        page.getByTestId("oauth-microsoft"),
        "BLOCKED ON OAUTH: Microsoft login is configured but the button is missing.",
      ).toBeVisible();
    } else {
      test.info().annotations.push({
        type: "informational",
        description: "Microsoft login is disabled or unconfigured by production OAuth self-check.",
      });
    }
  });

  test("Today view or signed-out gate loads without broken render", async ({ page }) => {
    const network = recordRuntimeNetwork(page);

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
    await expectNoVercelAuthWall(page);
    await expectNoBlockingErrorUi(page);

    const signInVisible = await page.getByRole("heading", { name: "Sign in" }).isVisible().catch(() => false);
    if (signInVisible) {
      await expect(page.getByTestId("email-input")).toBeVisible();
    } else {
      await expect(
        page
          .getByText("Today", { exact: true })
          .or(page.getByText("Welcome back.", { exact: true }))
          .or(page.getByText("Refresh live context", { exact: true })),
      ).toBeVisible({ timeout: 30_000 });
    }

    expect(network.serverResponses, "FAIL: Today/auth gate should not produce 5xx network responses.").toEqual([]);
    await expectNoLocalUrlsInPage(page, network.requests);
  });

  test("/api/assistant returns valid JSON success or controlled JSON 4xx", async ({ request }) => {
    const response = await request.post("/api/assistant", {
      headers: { Accept: "application/json" },
      data: {
        kind: "chat",
        message: "Production smoke: confirm controlled assistant response.",
        context: {
          generated_at: new Date().toISOString(),
          run_date: new Date().toISOString().slice(0, 10),
          todoist_overdue: [],
          todoist_due_today: [],
          todoist_upcoming_high_priority: [],
          gmail_signals: [],
          calendar_today: [],
        },
      },
    });

    expectControlledApiStatus(response, "/api/assistant");
    const body = await parseJsonResponse(response, "/api/assistant");
    expectObjectJson(body, "/api/assistant response");
    expectAssistantShape(body, response.status());
  });

  test("/api/job-hunt/digest returns valid JSON success or controlled JSON error", async ({ request }) => {
    const response = await request.get("/api/job-hunt/digest", {
      headers: { Accept: "application/json" },
    });

    expectControlledApiStatus(response, "/api/job-hunt/digest");
    const body = await parseJsonResponse(response, "/api/job-hunt/digest");
    expectObjectJson(body, "/api/job-hunt/digest response");

    if (response.status() === 200) {
      expect(
        typeof body.ok === "boolean" || Array.isArray(body.items) || Array.isArray(body.jobs),
        "FAIL: digest success should include ok boolean or result arrays.",
      ).toBe(true);
    } else {
      expectControlledErrorShape(body, "/api/job-hunt/digest");
    }

    const serialized = JSON.stringify(body);
    for (const pattern of LOCAL_SERVICE_PATTERNS) {
      expect(serialized, `BLOCKED ON ENV: JobHunt digest leaked a local service URL by ${pattern}.`).not.toMatch(pattern);
    }
  });

  test("production safety scan finds no local service URLs", async ({ page }) => {
    const network = recordRuntimeNetwork(page);

    await page.goto("/sign-in", { waitUntil: "domcontentloaded", timeout: 60_000 });
    const selfCheckJson = await getOAuthSelfCheck(page);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);

    if (selfCheckJson) {
      const serialized = JSON.stringify(selfCheckJson);
      for (const pattern of LOCAL_SERVICE_PATTERNS) {
        expect(serialized, `BLOCKED ON ENV: OAuth self-check leaked a local service URL by ${pattern}.`).not.toMatch(pattern);
      }
    }

    await expectNoLocalUrlsInPage(page, network.requests);
  });
});
