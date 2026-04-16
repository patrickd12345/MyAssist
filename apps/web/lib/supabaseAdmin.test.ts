import { describe, expect, it, vi } from "vitest";
import {
  resolveSupabaseProjectUrl,
  resolveSupabaseSecretKey,
  isSupabaseHostedStorageEnabled,
} from "./supabaseAdmin";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";

vi.mock("@/lib/env/runtime", () => ({
  resolveMyAssistRuntimeEnv: vi.fn(),
}));

describe("supabaseAdmin", () => {
  describe("resolveSupabaseProjectUrl", () => {
    it("returns the URL when present in environment", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
      } as any);
      expect(resolveSupabaseProjectUrl()).toBe("https://xyz.supabase.co");
    });

    it("returns undefined when URL is empty string", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "",
      } as any);
      expect(resolveSupabaseProjectUrl()).toBeUndefined();
    });

    it("returns undefined when URL is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({} as any);
      expect(resolveSupabaseProjectUrl()).toBeUndefined();
    });
  });

  describe("resolveSupabaseSecretKey", () => {
    it("returns the key when present", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseSecretKey: "sb_secret_123",
      } as any);
      expect(resolveSupabaseSecretKey()).toBe("sb_secret_123");
    });

    it("returns undefined when key is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({} as any);
      expect(resolveSupabaseSecretKey()).toBeUndefined();
    });
  });

  describe("isSupabaseHostedStorageEnabled", () => {
    it("returns true when both URL and key are present", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
        supabaseSecretKey: "sb_secret_123",
      } as any);
      expect(isSupabaseHostedStorageEnabled()).toBe(true);
    });

    it("returns false when URL is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseSecretKey: "sb_secret_123",
      } as any);
      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });

    it("returns false when key is missing", () => {
      vi.mocked(resolveMyAssistRuntimeEnv).mockReturnValue({
        supabaseProjectUrl: "https://xyz.supabase.co",
      } as any);
      expect(isSupabaseHostedStorageEnabled()).toBe(false);
    });
  });
});
