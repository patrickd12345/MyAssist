import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionUserDisplayFirstName, getSessionUserId } from "./session";
import { getSupabaseServerUser } from "./supabaseServer";

vi.mock("./supabaseServer", () => ({
  getSupabaseServerUser: vi.fn(),
}));

describe("session auth-disabled guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.MYASSIST_DEV_USER_ID;
    vi.mocked(getSupabaseServerUser).mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("preserves auth-disabled dev user behavior in tests", async () => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "playwright-user";

    await expect(getSessionUserId()).resolves.toBe("playwright-user");
    await expect(getSessionUserDisplayFirstName()).resolves.toBe("there");
    expect(getSupabaseServerUser).not.toHaveBeenCalled();
  });

  it("rejects auth-disabled sessions in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.MYASSIST_AUTH_DISABLED = "true";

    await expect(getSessionUserId()).rejects.toThrow(/MYASSIST_AUTH_DISABLED/);
    await expect(getSessionUserDisplayFirstName()).rejects.toThrow(/MYASSIST_AUTH_DISABLED/);
    expect(getSupabaseServerUser).not.toHaveBeenCalled();
  });

  it("uses Supabase session lookup when auth-disabled is not set", async () => {
    delete process.env.MYASSIST_AUTH_DISABLED;
    vi.mocked(getSupabaseServerUser).mockResolvedValue({
      id: "real-user",
      email: "patrick@example.com",
    } as never);

    await expect(getSessionUserId()).resolves.toBe("real-user");
    await expect(getSessionUserDisplayFirstName()).resolves.toBe("Patrick");
  });
});
