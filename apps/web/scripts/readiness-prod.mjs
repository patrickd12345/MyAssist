import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const productRoot = join(__dirname, "..", "..", "..");

const VERDICTS = {
  PASS: "PASS",
  ENV: "BLOCKED ON ENV",
  OAUTH: "BLOCKED ON OAUTH",
  DEPLOYMENT: "BLOCKED ON DEPLOYMENT",
  FAIL: "FAIL",
};

const checks = [
  {
    name: "Infisical production secrets",
    command: "pnpm --prefix apps/web run verify:infisical -- --env=prod",
    args: ["--prefix", "apps/web", "run", "verify:infisical", "--", "--env=prod"],
    failureVerdict: VERDICTS.ENV,
    failureReason: "Production Infisical verification failed.",
  },
  {
    name: "Production env readiness",
    command: "pnpm --prefix apps/web run check:env:prod:infisical",
    args: ["--prefix", "apps/web", "run", "check:env:prod:infisical"],
    failureVerdict: VERDICTS.ENV,
    failureReason: "Production environment readiness check failed.",
  },
  {
    name: "Lint",
    command: "pnpm --prefix apps/web run lint",
    args: ["--prefix", "apps/web", "run", "lint"],
    failureVerdict: VERDICTS.FAIL,
    failureReason: "Lint failed.",
  },
  {
    name: "Typecheck",
    command: "pnpm --prefix apps/web run typecheck",
    args: ["--prefix", "apps/web", "run", "typecheck"],
    failureVerdict: VERDICTS.FAIL,
    failureReason: "Typecheck failed.",
  },
  {
    name: "Vitest single worker",
    command: "NODE_OPTIONS=--max-old-space-size=4096 pnpm --prefix apps/web exec vitest run --maxWorkers=1",
    args: ["--prefix", "apps/web", "exec", "vitest", "run", "--maxWorkers=1"],
    env: { NODE_OPTIONS: "--max-old-space-size=4096" },
    // Strip prod secrets that override test mocks. Tests use their own fixtures/mocks for
    // these values; injecting real prod values breaks test isolation without adding coverage.
    stripEnv: [
      "AI_MODE",
      "MYASSIST_INTEGRATIONS_ENCRYPTION_KEY",
      "NEXT_PUBLIC_SITE_URL",
      "AUTH_URL",
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
    failureVerdict: VERDICTS.FAIL,
    failureReason: "Vitest failed.",
  },
];

function hasProductionSmokeUrl() {
  return Boolean(
    process.env.PLAYWRIGHT_PROD_SMOKE_BASE_URL?.trim() || process.env.MYASSIST_PRODUCTION_URL?.trim(),
  );
}

function runCheck(check) {
  const merged = { ...process.env, ...(check.env ?? {}) };
  for (const key of check.stripEnv ?? []) {
    delete merged[key];
  }
  const result = spawnSync("pnpm", check.args, {
    cwd: productRoot,
    env: merged,
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const exitCode = typeof result.status === "number" ? result.status : 1;
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const classified = exitCode === 0 ? VERDICTS.PASS : classifyFailure(check, output);

  return {
    step: stepName(check),
    command: check.command,
    status: classified,
    exitCode,
    reason: exitCode === 0 ? "Command completed successfully." : reasonForFailure(check, output, classified),
    nextAction: nextActionForFailure(check, output, classified),
  };
}

function classifyFailure(check, output) {
  if (check.name === "Infisical production secrets") {
    return classifyInfisicalFailure(output);
  }

  if (check.name === "Production env readiness") {
    return classifyEnvReadinessFailure(output);
  }

  if (check.name === "Playwright production smoke") {
    return classifyPlaywrightFailure(output);
  }

  const lower = output.toLowerCase();
  if (lower.includes("redirect uri") || lower.includes("oauth") || lower.includes("entra")) {
    return VERDICTS.OAUTH;
  }
  if (
    lower.includes("deployment protection") ||
    lower.includes("vercel authentication") ||
    lower.includes("vercel auth") ||
    lower.includes("production smoke must target") ||
    lower.includes("playwright_prod_smoke_base_url") ||
    lower.includes("myassist_production_url")
  ) {
    return VERDICTS.DEPLOYMENT;
  }
  return check.failureVerdict;
}

function classifyInfisicalFailure(output) {
  const lower = output.toLowerCase();
  if (hasMissingValues(output) || lower.includes("missing") || lower.includes("required")) {
    return VERDICTS.ENV;
  }
  if (lower.includes("redirect uri") || lower.includes("oauth") || lower.includes("entra")) {
    return VERDICTS.OAUTH;
  }
  return VERDICTS.ENV;
}

function classifyEnvReadinessFailure(output) {
  if (hasMalformedOrLocalhostMiss(output)) {
    return VERDICTS.FAIL;
  }
  if (
    hasAny(output, [
      "JOB_HUNT_DIGEST_URL",
      "RESEND_API_KEY",
      "MYASSIST_PASSWORD_RESET_EMAIL_FROM",
      "VERCEL_VIRTUAL_KEY",
      "OPENAI_API_KEY",
      "Gateway (AI_MODE=gateway)",
    ])
  ) {
    return VERDICTS.ENV;
  }
  if (hasAny(output, ["MICROSOFT_CLIENT_ID", "MICROSOFT_CLIENT_SECRET", "Microsoft / Outlook login"])) {
    return VERDICTS.OAUTH;
  }
  if (hasMissingValues(output)) {
    return VERDICTS.ENV;
  }
  return VERDICTS.FAIL;
}

function classifyPlaywrightFailure(output) {
  const lower = output.toLowerCase();
  if (
    lower.includes("deployment protection") ||
    lower.includes("vercel authentication") ||
    lower.includes("production smoke must target") ||
    lower.includes("playwright_prod_smoke_base_url") ||
    lower.includes("myassist_production_url")
  ) {
    return VERDICTS.DEPLOYMENT;
  }
  if (/\b5\d\d\b/.test(output) || lower.includes("localhost") || lower.includes("127.0.0.1") || lower.includes("::1")) {
    return VERDICTS.FAIL;
  }
  return VERDICTS.FAIL;
}

function reasonForFailure(check, output, verdict) {
  const missing = missingItems(output);
  const key = firstKnownMissingKey(output);
  if (key) return `Missing ${key}.`;
  if (missing.length > 0) return `Missing ${missing[0]}.`;
  if (verdict === VERDICTS.FAIL && hasMalformedOrLocalhostMiss(output)) {
    return "Production readiness found a localhost or malformed URL value.";
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const focused = lines.find((line) =>
    /failed|missing|required|invalid|localhost|redirect|oauth|deployment|vercel|error/i.test(line),
  );
  if (focused) return truncate(focused);
  if (verdict === VERDICTS.OAUTH) return "OAuth provider or callback validation failed.";
  if (verdict === VERDICTS.DEPLOYMENT) return "Deployment URL or deployment protection blocked validation.";
  return check.failureReason;
}

function nextActionForFailure(check, output, verdict) {
  if (verdict === VERDICTS.PASS) return "None.";

  const key = firstKnownMissingKey(output);
  if (key) return nextActionForKey(key);

  if (check.name === "Production env readiness" && hasMalformedOrLocalhostMiss(output)) {
    return "Replace localhost or malformed production URLs with hosted HTTPS values in Infisical prod and sync to Vercel.";
  }

  if (check.name === "Infisical production secrets" || verdict === VERDICTS.ENV) {
    return "Provision the missing production values in Infisical prod paths and sync the same names to the active Vercel project.";
  }

  if (verdict === VERDICTS.OAUTH) {
    return "Fix the provider app credentials, redirect URI, consent, or tenant configuration, then rerun readiness.";
  }

  if (verdict === VERDICTS.DEPLOYMENT) {
    return "Set PLAYWRIGHT_PROD_SMOKE_BASE_URL or MYASSIST_PRODUCTION_URL to the deployed MyAssist URL, then rerun readiness.";
  }

  return "Treat as a product-code/runtime failure and inspect the failing command output.";
}

function firstKnownMissingKey(output) {
  const keys = [
    "JOB_HUNT_DIGEST_URL",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "RESEND_API_KEY",
    "MYASSIST_PASSWORD_RESET_EMAIL_FROM",
    "VERCEL_VIRTUAL_KEY",
    "OPENAI_API_KEY",
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "MYASSIST_INTEGRATIONS_ENCRYPTION_KEY",
  ];
  return keys.find((key) => output.includes(key));
}

function nextActionForKey(key) {
  if (key === "JOB_HUNT_DIGEST_URL") {
    return "Provision hosted JOB_HUNT_DIGEST_URL in Infisical prod /myassist and sync to Vercel.";
  }
  if (key === "MICROSOFT_CLIENT_ID" || key === "MICROSOFT_CLIENT_SECRET") {
    return "If Microsoft OAuth is expected, provision Microsoft OAuth credentials in Infisical prod /myassist and sync to Vercel; otherwise document the provider as disabled.";
  }
  if (key === "RESEND_API_KEY" || key === "MYASSIST_PASSWORD_RESET_EMAIL_FROM") {
    return "If password reset is expected, provision Resend API key and verified sender in Infisical prod /myassist and sync to Vercel; otherwise document reset email as disabled.";
  }
  if (key === "VERCEL_VIRTUAL_KEY" || key === "OPENAI_API_KEY") {
    return "Provision the hosted AI gateway key in Infisical prod /myassist and sync to Vercel.";
  }
  if (key.startsWith("SUPABASE") || key.startsWith("NEXT_PUBLIC_SUPABASE")) {
    return "Provision Supabase production values in Infisical prod /platform and sync to Vercel.";
  }
  return `Provision ${key} in the appropriate Infisical prod path and sync to Vercel.`;
}

function hasAny(output, values) {
  return values.some((value) => output.includes(value));
}

function hasMissingValues(output) {
  return missingItems(output).length > 0 || /\bmissing\b/i.test(output) || /\bMISS\b/.test(output);
}

function missingItems(output) {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*MISS\s+(.+?)\s*$/)?.[1]?.trim())
    .filter(Boolean);
}

function hasMalformedOrLocalhostMiss(output) {
  return output
    .split(/\r?\n/)
    .some((line) => /^\s*MISS\b/i.test(line) && /\b(localhost|127\.0\.0\.1|0\.0\.0\.0|::1|malformed|invalid)\b/i.test(line));
}

function truncate(value) {
  return value.length > 180 ? `${value.slice(0, 177)}...` : value;
}

function printResult(result) {
  console.log(`\n[readiness:prod] Step: ${result.step}`);
  console.log(`[readiness:prod] Command: ${result.command}`);
  console.log(`[readiness:prod] Status: ${result.status}`);
  console.log(`[readiness:prod] Exit code: ${result.exitCode}`);
  console.log(`[readiness:prod] Reason: ${result.reason}`);
  console.log(`[readiness:prod] Next action: ${result.nextAction}`);
}

function stepName(check) {
  if (check.name === "Vitest single worker") return check.name;
  const script = check.command.match(/run\s+([^\s]+)/)?.[1];
  return script ?? check.name;
}

function finalVerdict(results) {
  const statuses = results.map((result) => result.status);
  if (statuses.includes(VERDICTS.ENV)) return VERDICTS.ENV;
  if (statuses.includes(VERDICTS.OAUTH)) return VERDICTS.OAUTH;
  if (statuses.includes(VERDICTS.DEPLOYMENT)) return VERDICTS.DEPLOYMENT;
  if (statuses.includes(VERDICTS.FAIL)) return VERDICTS.FAIL;
  return VERDICTS.PASS;
}

function exitCodeForVerdict(verdict) {
  if (verdict === VERDICTS.PASS) return 0;
  if (verdict === VERDICTS.FAIL) return 2;
  return 1;
}

const results = [];

console.log("[readiness:prod] MYA-DEPLOY-007 production readiness started.");
console.log(`[readiness:prod] working directory: ${productRoot}`);

for (const check of checks) {
  console.log(`\n[readiness:prod] running: ${check.command}`);
  const result = runCheck(check);
  results.push(result);
  printResult(result);
}

if (hasProductionSmokeUrl()) {
  const smokeCheck = {
    name: "Playwright production smoke",
    command: "pnpm --prefix apps/web run test:smoke:prod",
    args: ["--prefix", "apps/web", "run", "test:smoke:prod"],
    env: { PLAYWRIGHT_PROD_SMOKE: "1" },
    failureVerdict: VERDICTS.FAIL,
    failureReason: "Playwright production smoke failed.",
  };
  console.log(`\n[readiness:prod] running: ${smokeCheck.command}`);
  const result = runCheck(smokeCheck);
  results.push(result);
  printResult(result);
} else {
  const result = {
    step: "test:smoke:prod",
    command: "pnpm --prefix apps/web run test:smoke:prod",
    status: VERDICTS.DEPLOYMENT,
    exitCode: null,
    reason: "SKIPPED / BLOCKED ON DEPLOYMENT URL: set PLAYWRIGHT_PROD_SMOKE_BASE_URL or MYASSIST_PRODUCTION_URL.",
    nextAction: "Set PLAYWRIGHT_PROD_SMOKE_BASE_URL or MYASSIST_PRODUCTION_URL to the deployed MyAssist URL, then rerun readiness.",
  };
  results.push(result);
  printResult(result);
}

const verdict = finalVerdict(results);
console.log(`\n[readiness:prod] final verdict: ${verdict}`);
process.exit(exitCodeForVerdict(verdict));
