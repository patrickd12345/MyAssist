import { describe, expect, it } from "vitest";
import { analyzeMyAssistEnv, formatEnvReadinessReport } from "./envReadiness";

describe("envReadiness", () => {
  it("development profile passes with minimal env", () => {
    const r = analyzeMyAssistEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    expect(r.passed).toBe(true);
    expect(r.profile).toBe("development");
  });

  it("production_like requires auth and supabase", () => {
    const r = analyzeMyAssistEnv(
      { NODE_ENV: "production", VERCEL_ENV: "production" } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(false);
  });

  it("production_like passes with auth and supabase keys", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(true);
  });

  it("formatEnvReadinessReport includes sections", () => {
    const r = analyzeMyAssistEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    const s = formatEnvReadinessReport(r);
    expect(s).toContain("Auth");
    expect(s).toContain("Result:");
  });
});
