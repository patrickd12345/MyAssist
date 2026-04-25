import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const SECRET_VALUES = [
  "auth-secret-value",
  "google-client-id",
  "microsoft-client-id",
  "microsoft-client-secret",
  "resend-api-key",
  "support@bookiji.com",
];

async function getBody() {
  const res = await GET();
  const body = await res.json();
  return { res, body };
}

describe("GET /api/auth/oauth-self-check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns enabled capabilities when required env vars are present", async () => {
    vi.stubEnv("AUTH_SECRET", "auth-secret-value");
    vi.stubEnv("AUTH_URL", "https://myassist.bookiji.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "microsoft-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "microsoft-client-secret");
    vi.stubEnv("RESEND_API_KEY", "resend-api-key");
    vi.stubEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM", "support@bookiji.com");

    const { res, body } = await getBody();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      googleEnabled: true,
      microsoftEnabled: true,
      passwordResetEnabled: true,
      authEnabled: true,
    });
    for (const secretValue of SECRET_VALUES) {
      expect(JSON.stringify(body)).not.toContain(secretValue);
    }
  });

  it("returns disabled capabilities when env vars are missing or partial", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "microsoft-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM", "support@bookiji.com");

    const { res, body } = await getBody();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      googleEnabled: false,
      microsoftEnabled: false,
      passwordResetEnabled: false,
      authEnabled: false,
    });
    for (const secretValue of SECRET_VALUES) {
      expect(JSON.stringify(body)).not.toContain(secretValue);
    }
  });

  it("always returns HTTP 200 with the expected JSON shape", async () => {
    vi.stubEnv("AUTH_SECRET", "auth-secret-value");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "microsoft-client-secret");
    vi.stubEnv("RESEND_API_KEY", "resend-api-key");
    vi.stubEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM", "");

    const { res, body } = await getBody();

    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual([
      "authEnabled",
      "googleEnabled",
      "microsoftEnabled",
      "passwordResetEnabled",
    ]);
    expect(typeof body.googleEnabled).toBe("boolean");
    expect(typeof body.microsoftEnabled).toBe("boolean");
    expect(typeof body.passwordResetEnabled).toBe("boolean");
    expect(typeof body.authEnabled).toBe("boolean");
  });
});
