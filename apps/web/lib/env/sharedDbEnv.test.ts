import { describe, expect, it, vi } from "vitest";
import {
  fingerprintSecretMaterial,
  inferSharedDbTierFromDatabaseUrl,
  parseSupabaseProjectRef,
  resolveSharedDbTier,
  validateOptionalSharedDbTierLabel,
  validateSharedDbUrlMatchesDeploymentTier,
} from "./sharedDbEnv";

function env(partial: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return partial as NodeJS.ProcessEnv;
}

describe("sharedDbEnv", () => {
  it("resolveSharedDbTier: production on Vercel prod", () => {
    expect(resolveSharedDbTier(env({ VERCEL_ENV: "production" }))).toBe("prod");
  });

  it("resolveSharedDbTier: dev otherwise", () => {
    expect(resolveSharedDbTier(env({ VERCEL_ENV: "preview" }))).toBe("dev");
    expect(resolveSharedDbTier(env({}))).toBe("dev");
  });

  it("fingerprintSecretMaterial: empty vs value", () => {
    expect(fingerprintSecretMaterial(undefined)).toBe("empty");
    expect(fingerprintSecretMaterial("secret")).toHaveLength(8);
  });

  it("parseSupabaseProjectRef: extracts project ref from host", () => {
    expect(parseSupabaseProjectRef("https://abcd1234.supabase.co")).toBe("abcd1234");
    expect(parseSupabaseProjectRef("http://localhost")).toBeNull();
  });

  it("validateOptionalSharedDbTierLabel: no-op when unset", () => {
    expect(() => validateOptionalSharedDbTierLabel(env({}))).not.toThrow();
  });

  it("validateOptionalSharedDbTierLabel: warns on mismatch when not strict", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    validateOptionalSharedDbTierLabel(
      env({
        SHARED_DB_TIER: "prod",
        VERCEL_ENV: "preview",
      }),
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("validateOptionalSharedDbTierLabel: throws when strict and mismatch", () => {
    expect(() =>
      validateOptionalSharedDbTierLabel(
        env({
          SHARED_DB_TIER: "prod",
          VERCEL_ENV: "preview",
          SHARED_DB_ENV_STRICT: "1",
        }),
      ),
    ).toThrow(/Tier mismatch/);
  });

  it("inferSharedDbTierFromDatabaseUrl: unknown without ref env", () => {
    expect(
      inferSharedDbTierFromDatabaseUrl("https://abcd.supabase.co", env({})),
    ).toBe("unknown");
  });

  it("inferSharedDbTierFromDatabaseUrl: matches dev ref", () => {
    expect(
      inferSharedDbTierFromDatabaseUrl(
        "https://abcd.supabase.co",
        env({
          SHARED_DB_DEV_PROJECT_REF: "abcd",
          SHARED_DB_PROD_PROJECT_REF: "wxyz",
        }),
      ),
    ).toBe("dev");
  });

  it("validateSharedDbUrlMatchesDeploymentTier: no-op without both refs", () => {
    expect(() =>
      validateSharedDbUrlMatchesDeploymentTier(
        env({ VERCEL_ENV: "production", SHARED_DB_ENV_STRICT: "true" }),
        "https://abcd.supabase.co",
      ),
    ).not.toThrow();
  });

  it("validateSharedDbUrlMatchesDeploymentTier: throws when strict and tier mismatch", () => {
    expect(() =>
      validateSharedDbUrlMatchesDeploymentTier(
        env({
          VERCEL_ENV: "production",
          SHARED_DB_ENV_STRICT: "1",
          SHARED_DB_DEV_PROJECT_REF: "devproj",
          SHARED_DB_PROD_PROJECT_REF: "prodproj",
        }),
        "https://devproj.supabase.co",
      ),
    ).toThrow(/does not match deployment tier/);
  });
});
