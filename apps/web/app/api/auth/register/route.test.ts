import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRegisterRateLimitForTests } from "@/lib/registerRateLimit";

let tempDirs: string[] = [];
const originalUserStorePath = process.env.MYASSIST_USER_STORE_FILE;
const originalInvite = process.env.MYASSIST_REGISTRATION_INVITE_CODE;

afterEach(async () => {
  resetRegisterRateLimitForTests();
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  if (originalUserStorePath === undefined) {
    delete process.env.MYASSIST_USER_STORE_FILE;
  } else {
    process.env.MYASSIST_USER_STORE_FILE = originalUserStorePath;
  }
  if (originalInvite === undefined) {
    delete process.env.MYASSIST_REGISTRATION_INVITE_CODE;
  } else {
    process.env.MYASSIST_REGISTRATION_INVITE_CODE = originalInvite;
  }
  vi.resetModules();
});

describe("POST /api/auth/register", () => {
  beforeEach(async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "myassist-users-"));
    tempDirs.push(dir);
    process.env.MYASSIST_USER_STORE_FILE = path.join(dir, "users.json");
  });

  it("creates a user record", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "first@example.com", password: "correcthorse" }),
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
  });

  it("returns a generic error when email is already registered", async () => {
    const { POST } = await import("./route");
    const req = new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "dup@example.com", password: "correcthorse" }),
    });
    await POST(req);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error?: string };
    expect(json.error).toBeDefined();
  });

  it("rejects weak passwords without leaking details", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "weak@example.com", password: "short" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("requires invite code when MYASSIST_REGISTRATION_INVITE_CODE is set", async () => {
    process.env.MYASSIST_REGISTRATION_INVITE_CODE = "secret-invite-99";
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
        body: JSON.stringify({
          email: "inv2@example.com",
          password: "correcthorse",
          inviteCode: "secret-invite-99",
        }),
      }),
    );
    expect(ok.status).toBe(200);
  });

  it("returns 429 after too many registrations from the same IP", async () => {
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
    const json = (await blocked.json()) as { error?: string };
    expect(json.error).toMatch(/Too many/);
  });
});
