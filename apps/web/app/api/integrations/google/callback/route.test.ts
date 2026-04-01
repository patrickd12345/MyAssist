import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/integrations/service", () => ({
  integrationService: {
    exchangeGoogleAndStore: vi.fn(),
  },
}));

vi.mock("@/lib/integrations/oauthState", () => ({
  verifyGoogleOAuthState: vi.fn(),
}));

vi.mock("@/lib/integrations/origin", () => ({
  resolvePublicOrigin: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@/lib/integrations/oauthDebugLog", () => ({
  oauthDebugLog: vi.fn(),
}));

vi.mock("@/lib/serverLog", () => ({
  logServerEvent: vi.fn(),
}));

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(() => ({ nodeEnv: "test" })),
}));

describe("GET /api/integrations/google/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when code or state is missing", async () => {
    const req = new Request("http://localhost:3000/api/integrations/google/callback");
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
      error: "Missing OAuth code/state",
      code: "bad_request",
      message: "Missing OAuth code/state",
      })
    );
    expect(body.requestId).toEqual(expect.any(String));
  });

  it("redirects to connected provider on successful exchange", async () => {
    const { verifyGoogleOAuthState } = await import("@/lib/integrations/oauthState");
    const { integrationService } = await import("@/lib/integrations/service");

    vi.mocked(verifyGoogleOAuthState).mockReturnValue({
      userId: "user-123",
      provider: "gmail",
    });
    vi.mocked(integrationService.exchangeGoogleAndStore).mockResolvedValue(undefined);

    const req = new Request(
      "http://localhost:3000/api/integrations/google/callback?code=abc&state=state123"
    );
    const res = await GET(req);

    expect(integrationService.exchangeGoogleAndStore).toHaveBeenCalledWith({
      userId: "user-123",
      provider: "gmail",
      code: "abc",
      redirectUri: "http://localhost:3000/api/integrations/google/callback",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?integrations=connected&provider=gmail"
    );
  });
});
