import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.fn();
const getSupabaseAuthClient = vi.fn();

vi.mock("@/lib/supabaseAuth", () => ({
  getSupabaseAuthClient,
}));

describe("POST /api/auth/forgot-password", () => {
  const originalPublicAppUrl = process.env.MYASSIST_PUBLIC_APP_URL;
  const originalAuthUrl = process.env.AUTH_URL;
  const originalNodeEnv = process.env.NODE_ENV;

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
    if (originalPublicAppUrl === undefined) delete process.env.MYASSIST_PUBLIC_APP_URL;
    else process.env.MYASSIST_PUBLIC_APP_URL = originalPublicAppUrl;
    if (originalAuthUrl === undefined) delete process.env.AUTH_URL;
    else process.env.AUTH_URL = originalAuthUrl;
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
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

  it("calls Supabase resetPasswordForEmail with app redirect", async () => {
    process.env.MYASSIST_PUBLIC_APP_URL = "https://myassist.example.com";
    resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
