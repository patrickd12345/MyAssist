import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
const getSupabaseAuthClient = vi.fn();

vi.mock("@/lib/supabaseAuth", () => ({
  getSupabaseAuthClient,
}));

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    resetPasswordForEmail.mockReset();
    getSupabaseAuthClient.mockReset();
    getSupabaseAuthClient.mockReturnValue({
      auth: {
        resetPasswordForEmail,
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns 400 when email is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "" }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("calls resetPasswordForEmail with browser-facing host for localhost, not a mismatched public env", async () => {
    vi.stubEnv("AUTH_URL", "https://bookiji.example.com");
    vi.stubEnv("NODE_ENV", "development");
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost:3000/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "http://localhost:3000/reset-password",
    });
  });

  it("uses x-forwarded-host for reset link when that host matches configured MyAssist origin (production)", async () => {
    vi.resetModules();
    vi.stubEnv("AUTH_URL", "https://myassist.example.com");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("MYASSIST_PUBLIC_APP_URL", "https://myassist.example.com");
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://any.internal/v1/edge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-forwarded-host": "myassist.example.com",
          "x-forwarded-proto": "https",
        },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("user@example.com", {
      redirectTo: "https://myassist.example.com/reset-password",
    });
  });

  it("returns generic success when Supabase call fails", async () => {
    resetPasswordForEmail.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "user@example.com" }),
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});
