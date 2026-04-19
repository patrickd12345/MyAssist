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

  const bki019ProdEnv = {
    AUTH_URL: "https://myassist.bookiji.com",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    MICROSOFT_CLIENT_ID: "microsoft-client",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
    RESEND_API_KEY: "re_test",
    MYASSIST_PASSWORD_RESET_EMAIL_FROM: "MyAssist <reset@example.com>",
  };

  it("production_like passes with auth, supabase, OAuth, and reset email vars", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(true);
  });

  it("formatEnvReadinessReport includes sections", () => {
    const r = analyzeMyAssistEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv);
    const s = formatEnvReadinessReport(r);
    expect(s).toContain("Auth");
    expect(s).toContain("Billing (Stripe)");
    expect(s).toContain("Result:");
  });

  it("production_like fails when billing enabled without Stripe secrets", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        VERCEL_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
        BILLING_ENABLED: "true",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(false);
  });

  it("production_like fails when BKI-019 OAuth and email delivery vars are missing", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(false);
    expect(formatEnvReadinessReport(r)).toContain("Login OAuth (BKI-019)");
    expect(formatEnvReadinessReport(r)).toContain("Password reset email (BKI-019)");
  });
});
