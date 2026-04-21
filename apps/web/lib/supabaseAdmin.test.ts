import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  resolveSupabaseProjectUrl,
  resolveSupabaseSecretKey,
  getSupabaseAdmin,
  isSupabaseHostedStorageEnabled,
} from "./supabaseAdmin";
import type { MyAssistRuntimeEnv } from "@/lib/env/runtime";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { createClient } from "@supabase/supabase-js";

/** Real `createClient` return shape from `@supabase/supabase-js` (tests only need a shallow stub). */
type SupabaseJsClient = ReturnType<typeof import("@supabase/supabase-js").createClient>;

function stubSupabaseJsClient(marker: string): SupabaseJsClient {
  return { name: marker } as unknown as SupabaseJsClient;
}

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

/** Partial env overrides for tests; fields not used by supabaseAdmin are omitted via assertion. */
function stubRuntimeEnv(partial: Partial<MyAssistRuntimeEnv>): MyAssistRuntimeEnv {
  return partial as MyAssistRuntimeEnv;
}

describe("supabaseAdmin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the internal state of supabaseAdmin.ts if possible,
    // but since they are module-level variables, we might need to be careful with caching tests.
  });

  describe("resolveSupabaseProjectUrl", () => {
    it("returns the project URL when present in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({ supabaseProjectUrl: "https://xyz.supabase.co" })
      );

      expect(resolveSupabaseProjectUrl()).toBe("https://xyz.supabase.co");
    });

    it("returns undefined when project URL is empty in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({ supabaseProjectUrl: "" })
      );

      expect(resolveSupabaseProjectUrl()).toBeUndefined();
    });
  });

  describe("resolveSupabaseSecretKey", () => {
    it("returns the secret key when present in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({ supabaseSecretKey: "sb_secret_123" })
      );

      expect(resolveSupabaseSecretKey()).toBe("sb_secret_123");
    });

    it("returns undefined when secret key is empty in env", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({ supabaseSecretKey: "" })
      );

      expect(resolveSupabaseSecretKey()).toBeUndefined();
    });
  });

  describe("isSupabaseHostedStorageEnabled", () => {
    it("returns true when both URL and key are present", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "https://xyz.supabase.co",
          supabaseSecretKey: "sb_secret_123",
        })
      );

      expect(isSupabaseHostedStorageEnabled()).toBe(true);
    });

    it("returns false when URL is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "",
          supabaseSecretKey: "sb_secret_123",
        })
      );

      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });

    it("returns false when key is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "https://xyz.supabase.co",
          supabaseSecretKey: "",
        })
      );

      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });
  });

  describe("getSupabaseAdmin", () => {
    it("returns null and resets cache when config is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "",
          supabaseSecretKey: "",
        })
      );

      expect(getSupabaseAdmin()).toBeNull();
    });

    it("creates and caches the client when config is present", () => {
      const mockClient = stubSupabaseJsClient("supabase-client");
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "https://xyz.supabase.co",
          supabaseSecretKey: "sb_secret_123",
        })
      );
      vi.mocked(createClient).mockReturnValue(mockClient);

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
      const mockClient1 = stubSupabaseJsClient("client1");
      const mockClient2 = stubSupabaseJsClient("client2");

      // First config
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "https://url1.supabase.co",
          supabaseSecretKey: "key1",
        })
      );
      vi.mocked(createClient).mockReturnValue(mockClient1);

      getSupabaseAdmin();
      expect(createClient).toHaveBeenCalledTimes(1);

      // Second config
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue(
        stubRuntimeEnv({
          supabaseProjectUrl: "https://url2.supabase.co",
          supabaseSecretKey: "key2",
        })
      );
      vi.mocked(createClient).mockReturnValue(mockClient2);

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
