import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegisterRateLimitForTests } from "@/lib/registerRateLimit";

const signUp = vi.fn();
const getSupabaseAuthClient = vi.fn();

vi.mock("@/lib/supabaseAuth", () => ({
  getSupabaseAuthClient,
}));

afterEach(async () => {
  resetRegisterRateLimitForTests();
  delete process.env.MYASSIST_REGISTRATION_INVITE_CODE;
  vi.resetModules();
});

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    signUp.mockReset();
    getSupabaseAuthClient.mockReset();
    getSupabaseAuthClient.mockReturnValue({
      auth: {
        signUp,
      },
    });
  });

  it("creates a Supabase auth user with emailRedirectTo to MyAssist auth callback (default /)", async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "first@example.com", password: "correcthorse" }),
      }),
    );

    expect(res.status).toBe(200);
    expect(signUp).toHaveBeenCalledWith({
      email: "first@example.com",
      password: "correcthorse",
      options: {
        emailRedirectTo: "http://localhost/auth/callback?callbackUrl=%2F",
      },
    });
  });

  it("passes a safe callbackUrl for post-confirm email redirect (open redirects downgraded to /)", async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "a@b.com",
          password: "correcthorse",
          callbackUrl: "/tasks",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          emailRedirectTo: "http://localhost/auth/callback?callbackUrl=%2Ftasks",
        },
      }),
    );
  });

  it("returns generic error when Supabase sign up fails", async () => {
    signUp.mockResolvedValue({ data: null, error: { message: "failure" } });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "dup@example.com", password: "correcthorse" }),
      }),
    );

    expect(res.status).toBe(400);
  });

  it("requires invite code when MYASSIST_REGISTRATION_INVITE_CODE is set", async () => {
    process.env.MYASSIST_REGISTRATION_INVITE_CODE = "secret-invite-99";
    signUp.mockResolvedValue({ data: {}, error: null });

    const { POST } = await import("./route");
    const bad = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.50" },
        body: JSON.stringify({ email: "inv@example.com", password: "correcthorse", inviteCode: "wrong" }),
      }),
    );
    expect(bad.status).toBe(400);

    const ok = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "10.0.0.51" },
        body: JSON.stringify({ email: "inv2@example.com", password: "correcthorse", inviteCode: "secret-invite-99" }),
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("returns 429 after too many registrations from the same IP", async () => {
    signUp.mockResolvedValue({ data: {}, error: null });
    const { POST } = await import("./route");
    const headers = {
      "Content-Type": "application/json",
      "x-forwarded-for": "192.168.55.100",
    } as const;

    for (let i = 0; i < 10; i += 1) {
      const res = await POST(
        new Request("http://localhost/api/auth/register", {
          method: "POST",
          headers: { ...headers },
          body: JSON.stringify({ email: `u${i}@rate.example.com`, password: "correcthorse" }),
        }),
      );
      expect(res.status).toBe(200);
    }

    const blocked = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { ...headers },
        body: JSON.stringify({ email: "u11@rate.example.com", password: "correcthorse" }),
      }),
    );
    expect(blocked.status).toBe(429);
  }, 15000);
});
