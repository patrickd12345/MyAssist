import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
const updateUser = vi.fn();
const signOut = vi.fn();
const getSupabaseAuthClient = vi.fn();

vi.mock("@/lib/supabaseAuth", () => ({
  getSupabaseAuthClient,
}));

describe("POST /api/auth/reset-password", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    updateUser.mockReset();
    signOut.mockReset();
    getSupabaseAuthClient.mockReset();
    getSupabaseAuthClient.mockReturnValue({
      auth: {
        exchangeCodeForSession,
        updateUser,
        signOut,
      },
    });
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("returns 400 when code is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "updated-pass-123" }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/Invalid or expired reset link/);
  });

  it("returns 400 when password is too short", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "recovery-code", password: "short" }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/at least 8 characters/);
  });

  it("returns invalid link when recovery exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: null, error: { message: "invalid_grant" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "bad-code", password: "updated-pass-123" }),
      }),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toMatch(/Invalid or expired reset link/);
  });

  it("updates password through Supabase after exchanging recovery code", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    updateUser.mockResolvedValue({ data: {}, error: null });
    signOut.mockResolvedValue({ error: null });

    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "good-code", password: "updated-pass-123" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(exchangeCodeForSession).toHaveBeenCalledWith("good-code");
    expect(updateUser).toHaveBeenCalledWith({ password: "updated-pass-123" });
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
