import { beforeEach, describe, expect, it, vi } from "vitest";

const { getUser, signOut } = vi.hoisted(() => ({
  getUser: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(() => ({
    supabaseProjectUrl: "https://test.supabase.co",
    supabaseAnonKey: "test-anon",
  })),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser,
      signOut,
    },
  })),
}));

import { getSupabaseServerUser } from "./supabaseServer";

describe("getSupabaseServerUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns user when getUser succeeds", async () => {
    const u = { id: "u1", email: "a@b.com" } as import("@supabase/supabase-js").User;
    getUser.mockResolvedValue({ data: { user: u }, error: null });
    await expect(getSupabaseServerUser()).resolves.toEqual(u);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("calls signOut and returns null on refresh_token_not_found", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "Invalid Refresh Token: Refresh Token Not Found", code: "refresh_token_not_found" },
    });
    signOut.mockResolvedValue({ error: null });
    await expect(getSupabaseServerUser()).resolves.toBeNull();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("does not signOut on unrelated errors", async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: { message: "nope", code: "other" },
    });
    await expect(getSupabaseServerUser()).resolves.toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });
});
