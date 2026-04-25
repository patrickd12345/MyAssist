import { describe, expect, it } from "vitest";
import { assertMyAssistRuntimeEnv, resolveMyAssistRuntimeEnv } from "./runtime";

const baseProdEnv = {
  NODE_ENV: "production",
  AUTH_SECRET: "x".repeat(32),
  SUPABASE_URL: "https://abc.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test",
  MYASSIST_INTEGRATIONS_ENCRYPTION_KEY: "integration-encryption-key",
  AI_MODE: "gateway",
  VERCEL_AI_BASE_URL: "https://api.openai.com",
  VERCEL_VIRTUAL_KEY: "ai-key",
  JOB_HUNT_DIGEST_URL: "https://jobhunt.bookiji.com/digest",
};

describe("resolveMyAssistRuntimeEnv", () => {
  it("defaults local development to ollama", () => {
    expect(resolveMyAssistRuntimeEnv({ NODE_ENV: "development" } as NodeJS.ProcessEnv).aiMode).toBe("ollama");
  });

  it("defaults production-like env to gateway", () => {
    expect(resolveMyAssistRuntimeEnv({ NODE_ENV: "production" } as NodeJS.ProcessEnv).aiMode).toBe("gateway");
  });
});

describe("assertMyAssistRuntimeEnv", () => {
  it("passes the production Option 1 service wiring contract", () => {
    expect(() => assertMyAssistRuntimeEnv(baseProdEnv as NodeJS.ProcessEnv)).not.toThrow();
  });

  it("rejects production Ollama mode", () => {
    expect(() =>
      assertMyAssistRuntimeEnv({
        ...baseProdEnv,
        AI_MODE: "ollama",
        OLLAMA_BASE_URL: "http://127.0.0.1:11434",
      } as NodeJS.ProcessEnv),
    ).toThrow(/AI_MODE=gateway/);
  });

  it("rejects production localhost service URLs", () => {
    expect(() =>
      assertMyAssistRuntimeEnv({
        ...baseProdEnv,
        JOB_HUNT_DIGEST_URL: "http://localhost:3847/digest",
      } as NodeJS.ProcessEnv),
    ).toThrow(/localhost service URLs/);
  });
});
