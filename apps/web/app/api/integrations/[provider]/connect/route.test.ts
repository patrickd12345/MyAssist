import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(),
}));

vi.mock("@/lib/userStore", () => ({
  getUserById: vi.fn(),
}));

vi.mock("@/lib/integrations/oauthState", () => ({
  createOAuthState: vi.fn(() => "signed-state"),
}));

vi.mock("@/lib/integrations/providers/google", () => ({
  buildGoogleAuthUrl: vi.fn(() => "https://accounts.google.com/o/oauth2/v2/auth?mock=1"),
}));

vi.mock("@/lib/integrations/providers/todoist", () => ({
  buildTodoistAuthUrl: vi.fn(() => "https://todoist.com/oauth/authorize?mock=1"),
}));

vi.mock("@/lib/integrations/origin", () => ({
  resolvePublicOrigin: vi.fn(() => "http://localhost:3000"),
}));

vi.mock("@/lib/integrations/oauthDebugLog", () => ({
  oauthDebugLog: vi.fn(),
}));

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(() => ({
    authUrl: "http://localhost:3000",
    nextAuthUrl: "",
    publicAppUrl: "",
    nodeEnv: "test",
  })),
}));

describe("GET /api/integrations/[provider]/connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to sign-in", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    vi.mocked(getSessionUserId).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/integrations/gmail/connect");
    const res = await GET(req, { params: Promise.resolve({ provider: "gmail" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/sign-in");
  });

  it("redirects authenticated gmail users to Google OAuth with unified callback", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    const { getUserById } = await import("@/lib/userStore");
    const { buildGoogleAuthUrl } = await import("@/lib/integrations/providers/google");

    vi.mocked(getSessionUserId).mockResolvedValueOnce("user-123");
    vi.mocked(getUserById).mockResolvedValueOnce({
      id: "user-123",
      email: "test@example.com",
    } as never);

    const req = new Request("http://localhost:3000/api/integrations/gmail/connect");
    const res = await GET(req, { params: Promise.resolve({ provider: "gmail" }) });

    expect(buildGoogleAuthUrl).toHaveBeenCalledWith({
      provider: "gmail",
      state: "signed-state",
      redirectUri: "http://localhost:3000/api/integrations/google/callback",
    });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth?mock=1"
    );
  });

  it("redirects to a user_not_found error when session user no longer exists", async () => {
    const { getSessionUserId } = await import("@/lib/session");
    const { getUserById } = await import("@/lib/userStore");

    vi.mocked(getSessionUserId).mockResolvedValueOnce("user-123");
    vi.mocked(getUserById).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/integrations/gmail/connect");
    const res = await GET(req, { params: Promise.resolve({ provider: "gmail" }) });

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/?integrations=error&reason=user_not_found"
    );
  });
});
