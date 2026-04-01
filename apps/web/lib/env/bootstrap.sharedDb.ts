import "server-only";

import {
  fingerprintSecretMaterial,
  logLandscapeContext,
  resolveSharedDbTier,
  safeUrlHost,
  validateOptionalSharedDbTierLabel,
  validateSharedDbUrlMatchesDeploymentTier,
} from "./sharedDbEnv";
import { assertMyAssistRuntimeEnv, resolveMyAssistRuntimeEnv } from "./runtime";

/**
 * Runs once per Node server boot. Logs a safe fingerprint line; optionally asserts auth env in production.
 */
export function runMyAssistSharedDbBootstrap(env: NodeJS.ProcessEnv = process.env): void {
  validateOptionalSharedDbTierLabel(env);
  const tier = resolveSharedDbTier(env);
  const runtime = resolveMyAssistRuntimeEnv(env);
  logLandscapeContext("myassist", env);
  validateSharedDbUrlMatchesDeploymentTier(env, runtime.supabaseProjectUrl);
  const supabaseHost = safeUrlHost(runtime.supabaseProjectUrl);
  const serviceFp = fingerprintSecretMaterial(runtime.supabaseSecretKey);

  console.warn(
    `[shared-db] myassist tier=${tier} vercelEnv=${env.VERCEL_ENV ?? "unset"} ` +
      `supabaseHost=${supabaseHost ?? "none"} serviceKeyFp=${serviceFp}`
  );

  const authDisabled =
    runtime.authDisabledRaw === "1" || runtime.authDisabledRaw.toLowerCase() === "true";
  if (!authDisabled || env.NODE_ENV === "production") {
    assertMyAssistRuntimeEnv(env);
  }
}
