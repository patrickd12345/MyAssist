import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/integrations/origin", () => ({
  resolvePublicOrigin: vi.fn(() => "https://myassist.bookiji.com"),
}));

describe("GET /api/auth/oauth-self-check", () => {
  it("returns login and integration callback URLs without secret values", async () => {
    vi.stubEnv("AUTH_SECRET", "auth-secret-value");
    vi.stubEnv("AUTH_URL", "https://myassist.bookiji.com");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "google-client-secret");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "microsoft-client-id");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "microsoft-client-secret");
    vi.stubEnv("RESEND_API_KEY", "resend-api-key");
    vi.stubEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM", "support@bookiji.com");

    const req = new Request("https://myassist.bookiji.com/api/auth/oauth-self-check");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      origin: "https://myassist.bookiji.com",
      providerStatus: {
        authSecretConfigured: true,
        authUrlConfigured: true,
        googleLoginConfigured: true,
        microsoftLoginConfigured: true,
        passwordResetEmailConfigured: true,
      },
      supabaseRedirectTargets: {
        google: "https://myassist.bookiji.com/sign-in",
        microsoftEntraId: "https://myassist.bookiji.com/sign-in",
      },
      integrationCallbacks: {
        google: "https://myassist.bookiji.com/api/integrations/google/callback",
      },
      googleCloudConsole: {
        authorizedJavaScriptOrigin: "https://myassist.bookiji.com",
        authorizedRedirectUris: [
          "https://myassist.bookiji.com/sign-in",
          "https://myassist.bookiji.com/api/integrations/google/callback",
        ],
      },
      microsoftEntraId: {
        redirectUri: "https://myassist.bookiji.com/sign-in",
      },
      notes: [
        "Google login and Gmail/Calendar integration are separate callback URLs.",
        "Add both Google redirect URIs to the same OAuth 2.0 Web client that matches this deployment's GOOGLE_CLIENT_ID unless intentionally using separate clients.",
        "This endpoint does not expose secret values.",
      ],
    });
    expect(JSON.stringify(body)).not.toContain("google-client-secret");
    expect(JSON.stringify(body)).not.toContain("microsoft-client-secret");
    expect(JSON.stringify(body)).not.toContain("auth-secret-value");
    expect(JSON.stringify(body)).not.toContain("resend-api-key");
  });

  it("reports missing provider readiness without exposing partial ids", async () => {
    vi.stubEnv("AUTH_SECRET", "");
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    vi.stubEnv("MYASSIST_PUBLIC_APP_URL", "");
    vi.stubEnv("GOOGLE_CLIENT_ID", "google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("MICROSOFT_CLIENT_ID", "");
    vi.stubEnv("MICROSOFT_CLIENT_SECRET", "microsoft-client-secret");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM", "support@bookiji.com");

    const req = new Request("https://myassist.bookiji.com/api/auth/oauth-self-check");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.providerStatus).toEqual({
      authSecretConfigured: false,
      authUrlConfigured: false,
      googleLoginConfigured: false,
      microsoftLoginConfigured: false,
      passwordResetEmailConfigured: false,
    });
    expect(JSON.stringify(body)).not.toContain("google-client-id");
    expect(JSON.stringify(body)).not.toContain("microsoft-client-secret");
  });
});
