import "server-only";
import { createHash } from "crypto";
import { logServerEvent } from "@/lib/serverLog";

export type SharedDbTier = "dev" | "prod";

export type LandscapeAppId = "bookiji" | "myassist" | "kinetix" | "chess";

export type InferredDbTier = "dev" | "prod" | "unknown";

export function resolveSharedDbTier(env: NodeJS.ProcessEnv = process.env): SharedDbTier {
  if (env.VERCEL_ENV === "production") {
    return "prod";
  }
  return "dev";
}

export function fingerprintSecretMaterial(value: string | undefined): string {
  if (!value?.trim()) {
    return "empty";
  }
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

export function safeUrlHost(url: string | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function validateOptionalSharedDbTierLabel(env: NodeJS.ProcessEnv = process.env): void {
  const label = env.SHARED_DB_TIER?.trim().toLowerCase();
  if (!label) {
    return;
  }
  if (label !== "dev" && label !== "prod") {
    logServerEvent("warn", "shared_db_tier_invalid", { label });
    return;
  }
  const resolved = resolveSharedDbTier(env);
  if (label !== resolved) {
    if (env.SHARED_DB_ENV_STRICT === "1" || env.SHARED_DB_ENV_STRICT === "true") {
      throw new Error(
        `[shared-db] Tier mismatch: deployment resolves to "${resolved}" but SHARED_DB_TIER="${label}".`
      );
    }
    logServerEvent("warn", "shared_db_tier_mismatch", { resolved, label });
  }
}

export function resolveLandscapeSlot(env: NodeJS.ProcessEnv = process.env): string {
  const vercel = env.VERCEL_ENV?.trim().toLowerCase();
  if (vercel === "production") {
    return "prod";
  }
  const appEnv = (env.APP_ENV || env.NEXT_PUBLIC_APP_ENV || "").trim().toLowerCase();
  if (appEnv === "staging") {
    return "staging";
  }
  if (vercel === "preview") {
    return "preview";
  }
  if (vercel === "development") {
    return "dev";
  }
  if (env.CI === "true" || env.CI === "1") {
    return "ci";
  }
  return "local";
}

export function logLandscapeContext(
  appId: LandscapeAppId,
  env: NodeJS.ProcessEnv = process.env
): void {
  const slot = resolveLandscapeSlot(env);
  const tier = resolveSharedDbTier(env);
  const app = env.LANDSCAPE_APP?.trim() || appId;
  logServerEvent("warn", "landscape_context", { slot, tier, app });
}

export function parseSupabaseProjectRef(url: string | undefined): string | null {
  if (!url?.trim()) {
    return null;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return null;
    }
    const m = /^([a-z0-9]+)\.supabase\.co$/.exec(host);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

export function inferSharedDbTierFromDatabaseUrl(
  dbUrl: string | undefined,
  env: NodeJS.ProcessEnv = process.env
): InferredDbTier {
  const devRef = env.SHARED_DB_DEV_PROJECT_REF?.trim().toLowerCase();
  const prodRef = env.SHARED_DB_PROD_PROJECT_REF?.trim().toLowerCase();
  if (!devRef && !prodRef) {
    return "unknown";
  }
  const ref = parseSupabaseProjectRef(dbUrl)?.toLowerCase();
  if (!ref) {
    return "unknown";
  }
  if (devRef && ref === devRef) {
    return "dev";
  }
  if (prodRef && ref === prodRef) {
    return "prod";
  }
  return "unknown";
}

export function validateSharedDbUrlMatchesDeploymentTier(
  env: NodeJS.ProcessEnv = process.env,
  dbUrl: string | undefined
): void {
  const strict = env.SHARED_DB_ENV_STRICT === "1" || env.SHARED_DB_ENV_STRICT === "true";
  const devRef = env.SHARED_DB_DEV_PROJECT_REF?.trim();
  const prodRef = env.SHARED_DB_PROD_PROJECT_REF?.trim();
  if (!devRef || !prodRef) {
    return;
  }

  const inferred = inferSharedDbTierFromDatabaseUrl(dbUrl, env);
  const deployment = resolveSharedDbTier(env);

  if (inferred === "unknown") {
    const ref = parseSupabaseProjectRef(dbUrl);
    if (strict && ref) {
      logServerEvent("warn", "shared_db_ref_unknown", { ref });
    }
    return;
  }

  if (inferred !== deployment) {
    if (strict) {
      throw new Error(
        `[shared-db] Database URL tier (${inferred}) does not match deployment tier (${deployment}).`
      );
    }
    logServerEvent("warn", "shared_db_url_tier_mismatch", {
      inferred,
      deployment,
    });
  }
}
