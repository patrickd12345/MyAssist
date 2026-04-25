/**
 * Pure env readiness analysis for MyAssist (no I/O, no secrets logged).
 */

import { findConfiguredLocalhostServiceUrls, isLocalhostServiceUrl } from "./urlGuards";

export type EnvReadinessItem = {
  id: string;
  ok: boolean;
  hint: string;
};

export type EnvReadinessSection = {
  title: string;
  items: EnvReadinessItem[];
};

export type EnvReadinessReport = {
  passed: boolean;
  profile: "development" | "production_like";
  sections: EnvReadinessSection[];
};

function hasAny(env: NodeJS.ProcessEnv, keys: string[]): boolean {
  for (const key of keys) {
    const v = env[key];
    if (typeof v === "string" && v.trim()) {
      return true;
    }
  }
  return false;
}

function item(id: string, ok: boolean, hint: string): EnvReadinessItem {
  return { id, ok, hint };
}

export function analyzeMyAssistEnv(
  env: NodeJS.ProcessEnv,
  opts: { productionLike?: boolean } = {},
): EnvReadinessReport {
  const productionLike =
    opts.productionLike === true ||
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production";

  const strictTier = env.SHARED_DB_ENV_STRICT === "1" || env.SHARED_DB_ENV_STRICT === "true";

  const sections: EnvReadinessSection[] = [];

  const authOk = hasAny(env, ["AUTH_SECRET", "NEXTAUTH_SECRET"]);
  const publicOriginOk = hasAny(env, ["AUTH_URL", "NEXTAUTH_URL", "MYASSIST_PUBLIC_APP_URL"]);
  const nextPublicSiteOk = hasAny(env, ["NEXT_PUBLIC_SITE_URL"]);
  const googleLoginOk =
    hasAny(env, ["GOOGLE_CLIENT_ID", "MYASSIST_GMAIL_CLIENT_ID", "MYASSIST_GOOGLE_CLIENT_ID"]) &&
    hasAny(env, ["GOOGLE_CLIENT_SECRET", "MYASSIST_GMAIL_CLIENT_SECRET", "MYASSIST_GOOGLE_CLIENT_SECRET"]);
  const todoistOAuthOk =
    hasAny(env, ["TODOIST_CLIENT_ID", "MYASSIST_TODOIST_CLIENT_ID"]) &&
    hasAny(env, ["TODOIST_CLIENT_SECRET", "MYASSIST_TODOIST_CLIENT_SECRET"]);
  const microsoftLoginOk =
    hasAny(env, [
      "MICROSOFT_CLIENT_ID",
      "MICROSOFT_ENTRA_ID_CLIENT_ID",
      "AUTH_MICROSOFT_ENTRA_ID_ID",
      "AZURE_AD_CLIENT_ID",
    ]) &&
    hasAny(env, [
      "MICROSOFT_CLIENT_SECRET",
      "MICROSOFT_ENTRA_ID_CLIENT_SECRET",
      "AUTH_MICROSOFT_ENTRA_ID_SECRET",
      "AZURE_AD_CLIENT_SECRET",
    ]);
  const passwordResetEmailOk =
    hasAny(env, ["RESEND_API_KEY", "MYASSIST_RESEND_API_KEY"]) &&
    hasAny(env, ["MYASSIST_PASSWORD_RESET_EMAIL_FROM", "PASSWORD_RESET_EMAIL_FROM", "RESEND_FROM_EMAIL"]);
  sections.push({
    title: "Auth",
    items: [
      item(
        "AUTH_SECRET or NEXTAUTH_SECRET",
        authOk,
        authOk
          ? "Set (value not shown)."
          : "Required for production build and runtime; dev may use fallback when unset.",
      ),
    ],
  });

  const supabaseUrlOk = hasAny(env, ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "VITE_SUPABASE_URL"]);
  const supabaseAnonKeyOk = hasAny(env, [
    "SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "VITE_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ]);
  const supabaseKeyOk = hasAny(env, ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  const integrationsEncryptionKeyOk = hasAny(env, ["MYASSIST_INTEGRATIONS_ENCRYPTION_KEY"]);
  const needsSupabase = productionLike || strictTier;

  sections.push({
    title: "Hosted storage (Supabase Path A)",
    items: [
      item(
        "SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL",
        supabaseUrlOk || !needsSupabase,
        needsSupabase
          ? "Required when NODE_ENV=production, VERCEL_ENV=production, or SHARED_DB_ENV_STRICT=1."
          : "Optional for local file-backed storage.",
      ),
      item(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY or publishable alias",
        supabaseAnonKeyOk || !needsSupabase,
        needsSupabase
          ? "Required for Supabase Auth PKCE callbacks and browser auth clients."
          : "Optional when local auth/storage is not using Supabase.",
      ),
      item(
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
        supabaseKeyOk || !needsSupabase,
        needsSupabase
          ? "Server-only service/secret key for myassist schema writes."
          : "Optional for local file-backed storage.",
      ),
      item(
        "MYASSIST_INTEGRATIONS_ENCRYPTION_KEY",
        integrationsEncryptionKeyOk || !productionLike,
        productionLike
          ? "Required in production so encrypted OAuth tokens survive AUTH_SECRET rotation."
          : "Strongly recommended when sharing OAuth token storage across environments.",
      ),
    ],
  });

  const gatewayOk =
    hasAny(env, ["VERCEL_AI_BASE_URL", "AI_GATEWAY_BASE_URL"]) &&
    hasAny(env, ["VERCEL_VIRTUAL_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY"]);
  const ollamaUrl = env.OLLAMA_BASE_URL || env.OLLAMA_API_URL || "";
  const ollamaOk = typeof ollamaUrl === "string" && ollamaUrl.trim() !== "" && !isLocalhostServiceUrl(ollamaUrl);
  const aiMode = (env.AI_MODE || (productionLike ? "gateway" : "ollama")).toLowerCase();
  const aiModeProductionOk = !productionLike || env.AI_MODE?.trim().toLowerCase() === "gateway";
  const gatewayUrl = env.VERCEL_AI_BASE_URL || env.AI_GATEWAY_BASE_URL || "";
  const gatewayUrlOk = !gatewayUrl.trim() || !isLocalhostServiceUrl(gatewayUrl);

  sections.push({
    title: "Assistant AI",
    items: [
      item(
        productionLike ? "AI_MODE=gateway" : "AI_MODE",
        ["gateway", "ollama", "fallback"].includes(aiMode) && aiModeProductionOk,
        productionLike
          ? "Production requires AI_MODE=gateway; local Ollama is dev-only."
          : "gateway | ollama (default) | fallback. Local dev may use Ollama.",
      ),
      item(
        "Gateway (AI_MODE=gateway)",
        aiMode !== "gateway" || gatewayOk,
        "Set VERCEL_AI_BASE_URL + VERCEL_VIRTUAL_KEY (or OPENAI_API_KEY) for hosted chat.",
      ),
      item(
        "Gateway URL not localhost",
        gatewayUrlOk,
        "Gateway base URL must point at a hosted OpenAI-compatible endpoint.",
      ),
      item(
        "Ollama URL (dev/remote only)",
        aiMode !== "ollama" || !productionLike || ollamaOk,
        "Production uses gateway; any remote Ollama URL must not be localhost-only.",
      ),
    ],
  });

  const billingEnabled = (env.BILLING_ENABLED || "").trim().toLowerCase() === "true";
  const stripeSecretOk = hasAny(env, ["STRIPE_SECRET_KEY"]);
  const stripeWebhookOk = hasAny(env, ["STRIPE_WEBHOOK_SECRET"]);
  const stripePriceOk = hasAny(env, ["MYASSIST_STRIPE_PRICE_ID", "STRIPE_PRICE_ID"]);
  sections.push({
    title: "Billing (Stripe)",
    items: [
      item(
        "BILLING_ENABLED",
        !billingEnabled || (stripeSecretOk && stripeWebhookOk),
        "When BILLING_ENABLED=true, set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET.",
      ),
      item(
        "STRIPE_SECRET_KEY (+ webhook secret)",
        !billingEnabled || (stripeSecretOk && stripeWebhookOk),
        "Server-only; required when billing is enabled.",
      ),
      item(
        "MYASSIST_STRIPE_PRICE_ID or STRIPE_PRICE_ID",
        !billingEnabled || stripePriceOk,
        "Default subscription price id for checkout when not passed in the request body.",
      ),
    ],
  });

  sections.push({
    title: "Login OAuth (BKI-019)",
    items: [
      item(
        "Google login",
        googleLoginOk || !productionLike,
        "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET; callback URL must be configured in Google Cloud Console.",
      ),
      item(
        "Microsoft / Outlook login",
        microsoftLoginOk || !productionLike,
        "Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET; callback URL must be configured in Azure / Microsoft Entra ID.",
      ),
      item(
        "AUTH_URL or NEXTAUTH_URL",
        publicOriginOk || !productionLike,
        "Public app origin used by Auth.js OAuth callbacks and password-reset links.",
      ),
      item(
        "NEXT_PUBLIC_SITE_URL",
        nextPublicSiteOk || !productionLike,
        "Canonical MyAssist origin for browser Supabase signInWithOAuth / magic-link redirectTo; without it, users on another Bookiji host get sent back to the wrong app.",
      ),
    ],
  });

  sections.push({
    title: "Password reset email (BKI-019)",
    items: [
      item(
        "RESEND_API_KEY",
        hasAny(env, ["RESEND_API_KEY", "MYASSIST_RESEND_API_KEY"]) || !productionLike,
        "Server-only Resend API key; required in production to deliver reset emails.",
      ),
      item(
        "MYASSIST_PASSWORD_RESET_EMAIL_FROM",
        hasAny(env, ["MYASSIST_PASSWORD_RESET_EMAIL_FROM", "PASSWORD_RESET_EMAIL_FROM", "RESEND_FROM_EMAIL"]) ||
          !productionLike,
        "Verified sender used for MyAssist password-reset emails.",
      ),
    ],
  });

  sections.push({
    title: "OAuth (integrations)",
    items: [
      item(
        "Google (Gmail + Calendar)",
        googleLoginOk,
        "Web client ID/secret; redirect URI must match AUTH_URL origin.",
      ),
      item(
        "Todoist",
        todoistOAuthOk,
        "OAuth client for Todoist connect and task actions.",
      ),
      item(
        "AUTH_URL",
        publicOriginOk,
        "Public app origin for OAuth redirects.",
      ),
    ],
  });

  const jobHuntDigestUrl = env.JOB_HUNT_DIGEST_URL?.trim() ?? "";
  const configuredLocalhostServiceUrls = findConfiguredLocalhostServiceUrls(env);
  sections.push({
    title: "Hosted service URLs",
    items: [
      item(
        "JOB_HUNT_DIGEST_URL",
        !productionLike || (jobHuntDigestUrl !== "" && !isLocalhostServiceUrl(jobHuntDigestUrl)),
        "Production digest calls must use JOB_HUNT_DIGEST_URL and must not fall back to localhost:3847.",
      ),
      item(
        "No configured localhost service URLs",
        !productionLike || configuredLocalhostServiceUrls.length === 0,
        configuredLocalhostServiceUrls.length > 0
          ? `Remove or replace: ${configuredLocalhostServiceUrls.map((u) => u.key).join(", ")}.`
          : "Production service URLs are hosted.",
      ),
      item(
        "MYASSIST_DEMO_MODE=false",
        !productionLike || (env.MYASSIST_DEMO_MODE ?? "").trim().toLowerCase() !== "true",
        "Production defaults to live provider reads; enable curated demo data only in local/demo environments.",
      ),
    ],
  });

  let passed = true;
  if (
    productionLike &&
    needsSupabase &&
    (!supabaseUrlOk || !supabaseAnonKeyOk || !supabaseKeyOk || !integrationsEncryptionKeyOk)
  ) {
    passed = false;
  }
  if (productionLike && !authOk) {
    passed = false;
  }
  if (productionLike && billingEnabled && (!stripeSecretOk || !stripeWebhookOk)) {
    passed = false;
  }
  if (
    productionLike &&
    (!googleLoginOk || !todoistOAuthOk || !microsoftLoginOk || !passwordResetEmailOk || !publicOriginOk || !nextPublicSiteOk)
  ) {
    passed = false;
  }
  if (
    productionLike &&
    (!aiModeProductionOk ||
      !gatewayOk ||
      !gatewayUrlOk ||
      jobHuntDigestUrl === "" ||
      isLocalhostServiceUrl(jobHuntDigestUrl) ||
      configuredLocalhostServiceUrls.length > 0 ||
      (env.MYASSIST_DEMO_MODE ?? "").trim().toLowerCase() === "true")
  ) {
    passed = false;
  }

  return {
    passed,
    profile: productionLike ? "production_like" : "development",
    sections,
  };
}

export function formatEnvReadinessReport(r: EnvReadinessReport): string {
  const lines: string[] = [];
  lines.push(`MyAssist env readiness (${r.profile})`);
  lines.push("---");
  for (const sec of r.sections) {
    lines.push(`[${sec.title}]`);
    for (const it of sec.items) {
      const mark = it.ok ? "ok  " : "MISS";
      lines.push(`  ${mark} ${it.id}`);
      if (!it.ok) {
        lines.push(`        ${it.hint}`);
      }
    }
  }
  lines.push("---");
  lines.push(r.passed ? "Result: PASS (critical items for this profile)" : "Result: FAIL (fix critical items)");
  return lines.join("\n");
}
