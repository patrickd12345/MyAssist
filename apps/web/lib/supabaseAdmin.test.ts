import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveSupabaseProjectUrl,
  resolveSupabaseSecretKey,
  getSupabaseAdmin,
  isSupabaseHostedStorageEnabled,
} from "./supabaseAdmin";
import { resolveMyAssistRuntimeEnv, type MyAssistRuntimeEnv } from "@/lib/env/runtime";
import { createClient } from "@supabase/supabase-js";

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

describe("supabaseAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal state of supabaseAdmin.ts if possible,
    // but since they are module-level variables, we might need to be careful with caching tests.
  });

  describe("resolveSupabaseProjectUrl", () => {
    it("returns the project URL when present in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
      } as unknown as MyAssistRuntimeEnv);

      expect(resolveSupabaseProjectUrl()).toBe("https://xyz.supabase.co");
    });

    it("returns undefined when project URL is empty in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "",
      } as unknown as MyAssistRuntimeEnv);

      expect(resolveSupabaseProjectUrl()).toBeUndefined();
    });
  });

  describe("resolveSupabaseSecretKey", () => {
    it("returns the secret key when present in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseSecretKey: "sb_secret_123",
      } as unknown as MyAssistRuntimeEnv);

      expect(resolveSupabaseSecretKey()).toBe("sb_secret_123");
    });

    it("returns undefined when secret key is empty in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseSecretKey: "",
      } as unknown as MyAssistRuntimeEnv);

      expect(resolveSupabaseSecretKey()).toBeUndefined();
    });
  });

  describe("isSupabaseHostedStorageEnabled", () => {
    it("returns true when both URL and key are present", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
        supabaseSecretKey: "sb_secret_123",
      } as unknown as MyAssistRuntimeEnv);

      expect(isSupabaseHostedStorageEnabled()).toBe(true);
    });

    it("returns false when URL is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "",
        supabaseSecretKey: "sb_secret_123",
      } as unknown as MyAssistRuntimeEnv);

      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });

    it("returns false when key is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
        supabaseSecretKey: "",
      } as unknown as MyAssistRuntimeEnv);

      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });
  });

  describe("getSupabaseAdmin", () => {
    it("returns null and resets cache when config is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "",
        supabaseSecretKey: "",
      } as unknown as MyAssistRuntimeEnv);

      expect(getSupabaseAdmin()).toBeNull();
    });

    it("creates and caches the client when config is present", () => {
      const mockClient = { name: "supabase-client" };
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
        supabaseSecretKey: "sb_secret_123",
      } as unknown as MyAssistRuntimeEnv);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createClient).mockReturnValue(mockClient as any);

      const client1 = getSupabaseAdmin();
      expect(client1).toBe(mockClient);
      expect(createClient).toHaveBeenCalledTimes(1);
      expect(createClient).toHaveBeenCalledWith(
        "https://xyz.supabase.co",
        "sb_secret_123",
        expect.any(Object)
      );

      // Call again, should return cached client
      const client2 = getSupabaseAdmin();
      expect(client2).toBe(mockClient);
      expect(createClient).toHaveBeenCalledTimes(1);
    });

    it("re-creates the client when config changes", () => {
      const mockClient1 = { name: "client1" };
      const mockClient2 = { name: "client2" };

      // First config
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://url1.supabase.co",
        supabaseSecretKey: "key1",
      } as unknown as MyAssistRuntimeEnv);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createClient).mockReturnValue(mockClient1 as any);

      getSupabaseAdmin();
      expect(createClient).toHaveBeenCalledTimes(1);

      // Second config
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://url2.supabase.co",
        supabaseSecretKey: "key2",
      } as unknown as MyAssistRuntimeEnv);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      vi.mocked(createClient).mockReturnValue(mockClient2 as any);

      const client2 = getSupabaseAdmin();
      expect(client2).toBe(mockClient2);
      expect(createClient).toHaveBeenCalledTimes(2);
      expect(createClient).toHaveBeenLastCalledWith(
        "https://url2.supabase.co",
        "key2",
        expect.any(Object)
      );
    });
  });
});
