export function isLocalhostServiceUrl(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host === "::1" ||
      host.endsWith(".localhost")
    );
  } catch {
    return /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])\b/i.test(raw);
  }
}

export type ServiceUrlEnvKey =
  | "OLLAMA_BASE_URL"
  | "OLLAMA_API_URL"
  | "VERCEL_AI_BASE_URL"
  | "AI_GATEWAY_BASE_URL"
  | "JOB_HUNT_DIGEST_URL"
  | "JOB_HUNT_SIGNALS_URL"
  | "MYASSIST_GMAIL_MARK_READ_WEBHOOK_URL"
  | "MYASSIST_JOB_HUNT_PREP_WEBHOOK";

const PRODUCTION_SERVICE_URL_KEYS: ServiceUrlEnvKey[] = [
  "OLLAMA_BASE_URL",
  "OLLAMA_API_URL",
  "VERCEL_AI_BASE_URL",
  "AI_GATEWAY_BASE_URL",
  "JOB_HUNT_DIGEST_URL",
  "JOB_HUNT_SIGNALS_URL",
  "MYASSIST_GMAIL_MARK_READ_WEBHOOK_URL",
  "MYASSIST_JOB_HUNT_PREP_WEBHOOK",
];

export function findConfiguredLocalhostServiceUrls(env: NodeJS.ProcessEnv = process.env): Array<{
  key: ServiceUrlEnvKey;
  value: string;
}> {
  const found: Array<{ key: ServiceUrlEnvKey; value: string }> = [];
  for (const key of PRODUCTION_SERVICE_URL_KEYS) {
    const value = env[key];
    if (typeof value === "string" && value.trim() && isLocalhostServiceUrl(value)) {
      found.push({ key, value: value.trim() });
    }
  }
  return found;
}
