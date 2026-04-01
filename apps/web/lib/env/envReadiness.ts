/**
 * Pure env readiness analysis for MyAssist (no I/O, no secrets logged).
 */

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
  const supabaseKeyOk = hasAny(env, ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
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
        "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY",
        supabaseKeyOk || !needsSupabase,
        needsSupabase
          ? "Server-only service/secret key for myassist schema writes."
          : "Optional for local file-backed storage.",
      ),
      item(
        "MYASSIST_INTEGRATIONS_ENCRYPTION_KEY",
        hasAny(env, ["MYASSIST_INTEGRATIONS_ENCRYPTION_KEY"]) || !productionLike,
        "Strongly recommended in production so OAuth tokens survive AUTH_SECRET rotation.",
      ),
    ],
  });

  const gatewayOk =
    hasAny(env, ["VERCEL_AI_BASE_URL", "AI_GATEWAY_BASE_URL"]) &&
    hasAny(env, ["VERCEL_VIRTUAL_KEY", "AI_GATEWAY_API_KEY", "OPENAI_API_KEY"]);
  const ollamaUrl = env.OLLAMA_BASE_URL || env.OLLAMA_API_URL || "";
  const ollamaOk = typeof ollamaUrl === "string" && ollamaUrl.trim() !== "" && !ollamaUrl.includes("127.0.0.1");
  const aiMode = (env.AI_MODE || "ollama").toLowerCase();

  sections.push({
    title: "Assistant AI",
    items: [
      item(
        "AI_MODE",
        ["gateway", "ollama", "fallback"].includes(aiMode),
        "gateway | ollama (default) | fallback. Hosted serverless usually needs gateway or remote Ollama URL.",
      ),
      item(
        "Gateway (AI_MODE=gateway)",
        aiMode !== "gateway" || gatewayOk,
        "Set VERCEL_AI_BASE_URL + VERCEL_VIRTUAL_KEY (or OPENAI_API_KEY) for hosted chat.",
      ),
      item(
        "Ollama URL (hosted)",
        aiMode !== "ollama" || !productionLike || ollamaOk,
        "For ollama on Vercel, OLLAMA_BASE_URL must not be localhost-only.",
      ),
    ],
  });

  sections.push({
    title: "OAuth (integrations)",
    items: [
      item(
        "Google (Gmail + Calendar)",
        hasAny(env, ["GOOGLE_CLIENT_ID", "MYASSIST_GMAIL_CLIENT_ID", "MYASSIST_GOOGLE_CLIENT_ID"]) &&
          hasAny(env, ["GOOGLE_CLIENT_SECRET", "MYASSIST_GMAIL_CLIENT_SECRET", "MYASSIST_GOOGLE_CLIENT_SECRET"]),
        "Web client ID/secret; redirect URI must match AUTH_URL origin.",
      ),
      item(
        "Todoist",
        hasAny(env, ["TODOIST_CLIENT_ID", "MYASSIST_TODOIST_CLIENT_ID"]) &&
          hasAny(env, ["TODOIST_CLIENT_SECRET", "MYASSIST_TODOIST_CLIENT_SECRET"]),
        "OAuth client for Todoist connect and task actions.",
      ),
      item(
        "AUTH_URL",
        hasAny(env, ["AUTH_URL", "NEXTAUTH_URL", "MYASSIST_PUBLIC_APP_URL"]),
        "Public app origin for OAuth redirects.",
      ),
    ],
  });

  let passed = true;
  if (productionLike && needsSupabase && (!supabaseUrlOk || !supabaseKeyOk)) {
    passed = false;
  }
  if (productionLike && !authOk) {
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
