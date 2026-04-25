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
    NEXT_PUBLIC_SITE_URL: "https://myassist.bookiji.com",
    AI_MODE: "gateway",
    VERCEL_AI_BASE_URL: "https://api.openai.com",
    VERCEL_VIRTUAL_KEY: "ai-key",
    JOB_HUNT_DIGEST_URL: "https://jobhunt.bookiji.com/digest",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
    MYASSIST_INTEGRATIONS_ENCRYPTION_KEY: "integration-encryption-key",
    GOOGLE_CLIENT_ID: "google-client",
    GOOGLE_CLIENT_SECRET: "google-secret",
    TODOIST_CLIENT_ID: "todoist-client",
    TODOIST_CLIENT_SECRET: "todoist-secret",
    MICROSOFT_CLIENT_ID: "microsoft-client",
    MICROSOFT_CLIENT_SECRET: "microsoft-secret",
  };

  it("production_like passes with auth, supabase, and OAuth vars", () => {
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

  it("production_like fails when NEXT_PUBLIC_SITE_URL is missing", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
        NEXT_PUBLIC_SITE_URL: "",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(false);
    expect(formatEnvReadinessReport(r)).toContain("NEXT_PUBLIC_SITE_URL");
  });

  it("production_like fails when BKI-019 OAuth vars are missing", () => {
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
    expect(formatEnvReadinessReport(r)).toContain("Custom password reset email (optional)");
  });

  it("production_like fails when AI_MODE is not gateway", () => {
    const r = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
        AI_MODE: "ollama",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(r.passed).toBe(false);
    expect(formatEnvReadinessReport(r)).toContain("AI_MODE=gateway");
    expect(formatEnvReadinessReport(r)).toContain("No configured localhost service URLs");
  });

  it("production_like fails when JobHunt digest URL is missing or localhost", () => {
    const missing = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
        JOB_HUNT_DIGEST_URL: "",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(missing.passed).toBe(false);

    const localhost = analyzeMyAssistEnv(
      {
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
        SUPABASE_URL: "https://abc.supabase.co",
        SUPABASE_SECRET_KEY: "sb_secret_test",
        ...bki019ProdEnv,
        JOB_HUNT_DIGEST_URL: "http://localhost:3847/digest",
      } as NodeJS.ProcessEnv,
      { productionLike: true },
    );
    expect(localhost.passed).toBe(false);
    expect(formatEnvReadinessReport(localhost)).toContain("JOB_HUNT_DIGEST_URL");
  });
});
