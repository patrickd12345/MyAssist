import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { exchangeCodeForSession, getUser, ensureAppUser, resolveMyAssistRuntimeEnv } = vi.hoisted(() => {
  return {
    exchangeCodeForSession: vi.fn(),
    getUser: vi.fn(),
    ensureAppUser: vi.fn(),
    resolveMyAssistRuntimeEnv: vi.fn(() => ({
      supabaseProjectUrl: "http://localhost:54321",
      supabaseAnonKey: "test-anon-key",
    })),
  };
});

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession,
      getUser,
    },
  })),
}));

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv,
}));

vi.mock("@/lib/ensureAppUser", () => ({
  ensureAppUser,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

function defaultUser() {
  return {
    data: {
      user: {
        id: "auth-subject",
        email: "you@example.com",
      },
    },
    error: null,
  };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveMyAssistRuntimeEnv.mockImplementation(() => ({
      supabaseProjectUrl: "http://localhost:54321",
      supabaseAnonKey: "test-anon-key",
    }));
    exchangeCodeForSession.mockResolvedValue({ error: null });
    getUser.mockResolvedValue(defaultUser());
    ensureAppUser.mockResolvedValue({ ok: true });
  });

  it("redirects to sign-in with error when code is missing", async () => {
    const req = new Request("http://localhost:3000/auth/callback?callbackUrl=%2Fdashboard");
    const res = await GET(req);
    const loc = res.headers.get("location");
    const u = new URL(loc!);

    expect(res.status).toBe(307);
    expect(u.origin).toBe("http://localhost:3000");
    expect(u.pathname).toBe("/sign-in");
    expect(u.searchParams.get("error")).toBe("missing_code");
    expect(u.searchParams.get("callbackUrl")).toBe("/dashboard");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("exchanges code and redirects to callbackUrl", async () => {
    const req = new Request(
      "http://localhost:3000/auth/callback?code=abc&callbackUrl=%2Ftasks",
    );
    const res = await GET(req);

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/tasks");
  });

  it("accepts next as alias for destination path", async () => {
    const req = new Request("http://localhost:3000/auth/callback?code=abc&next=%2Finbox");
    const res = await GET(req);

    expect(res.headers.get("location")).toBe("http://localhost:3000/inbox");
  });

  it("redirects to sign-in when exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValueOnce({ error: { message: "bad" } });
    const req = new Request("http://localhost:3000/auth/callback?code=bad");
    const res = await GET(req);

    const u = new URL(res.headers.get("location")!);
    expect(u.pathname).toBe("/sign-in");
    expect(u.searchParams.get("error")).toBe("exchange_failed");
  });

  it("redirects to sign-in when supabase is not configured", async () => {
    resolveMyAssistRuntimeEnv.mockImplementation(() => ({
      supabaseProjectUrl: "",
      supabaseAnonKey: "test-anon-key",
    }));
    const req = new Request("http://localhost:3000/auth/callback?code=abc");
    const res = await GET(req);
    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("auth_unavailable");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in when supabase anon key is missing", async () => {
    resolveMyAssistRuntimeEnv.mockImplementation(() => ({
      supabaseProjectUrl: "http://localhost:54321",
      supabaseAnonKey: "",
    }));
    const req = new Request("http://localhost:3000/auth/callback?code=abc");
    const res = await GET(req);
    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("auth_unavailable");
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("redirects to sign-in with session_failed when getUser has no user", async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    const req = new Request("http://localhost:3000/auth/callback?code=ok");
    const res = await GET(req);
    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("session_failed");
  });

  it("redirects to sign-in with account_link on EMAIL_CONFLICT", async () => {
    ensureAppUser.mockResolvedValueOnce({ ok: false, code: "EMAIL_CONFLICT" });
    const req = new Request("http://localhost:3000/auth/callback?code=ok");
    const res = await GET(req);

    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("account_link");
  });

  it("redirects to sign-in with bridge_failed when ensureAppUser fails (non-conflict)", async () => {
    ensureAppUser.mockResolvedValueOnce({ ok: false, code: "DB_ERROR" });
    const req = new Request("http://localhost:3000/auth/callback?code=ok");
    const res = await GET(req);
    const u = new URL(res.headers.get("location")!);
    expect(u.searchParams.get("error")).toBe("bridge_failed");
  });

  it("blocks open redirects in callbackUrl", async () => {
    const req = new Request(
      "http://localhost:3000/auth/callback?code=abc&callbackUrl=%2F%2Fevil.com%2Fx",
    );
    const res = await GET(req);

    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });
});
