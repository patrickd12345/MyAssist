import { describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock("@/lib/integrations/origin", () => ({
  resolvePublicOrigin: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@/lib/integrations/providers/google", () => ({
  GMAIL_MVP_OAUTH_SCOPES: [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/gmail.readonly",
  ],
  googleClientId: vi.fn(() => "client-id-12345678"),
}));

describe("GET /api/integrations/oauth-self-check", () => {
  it("returns 401 when unauthenticated", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    vi.mocked(getSessionUserId).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/integrations/oauth-self-check");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        error: "Unauthorized",
        code: "unauthorized",
        message: "Unauthorized",
      })
    );
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("returns exact redirect URI details when authenticated", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    vi.mocked(getSessionUserId).mockResolvedValueOnce("user-123");

    const req = new Request("http://localhost:3000/api/integrations/oauth-self-check");
    const res = await GET(req);

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      redirectUri: "http://localhost:3000/api/integrations/google/callback",
      resolvedOrigin: "http://localhost:3000",
      rawRequestOrigin: "http://localhost:3000",
      forwardedHost: null,
      forwardedProto: null,
      requestUrl: "http://localhost:3000/api/integrations/oauth-self-check",
      clientIdSuffix: "12345678",
      hasGoogleClientId: true,
      gmailMvpScopes: [
        "openid",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
        "https://www.googleapis.com/auth/gmail.readonly",
      ],
      gmailVerifyPath: "/api/integrations/gmail/verify",
      hint:
        "Add `redirectUri` exactly (scheme, host, path — no trailing slash) to the Web application OAuth client that matches this deployment's client ID.",
    });
  });
});
