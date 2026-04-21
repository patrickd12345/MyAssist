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
