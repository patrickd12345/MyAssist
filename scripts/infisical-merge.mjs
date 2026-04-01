import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const appsWebRoot = join(repoRoot, "apps", "web");

/**
 * @param {string} secretPath
 * @param {string} envName
 * @param {string} infisicalCwd
 */
function exportSecrets(secretPath, envName, infisicalCwd) {
  const output = execFileSync(
    "infisical",
    ["export", "--env", envName, "--path", secretPath, "--format", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      cwd: infisicalCwd,
    },
  );

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected Infisical export payload for path ${secretPath}`);
  }

  return Object.fromEntries(
    parsed
      .filter((entry) => entry && typeof entry.key === "string")
      .map((entry) => [entry.key, typeof entry.value === "string" ? entry.value : ""]),
  );
}

/**
 * Merges Infisical `/platform` + `/myassist` into `baseEnv` when the CLI is available and export succeeds.
 * On failure (CLI missing, not logged in, no project link), returns `baseEnv` unchanged and logs a short hint.
 *
 * @param {NodeJS.ProcessEnv} baseEnv
 * @param {{ infisicalCwd?: string }} [options]
 * @returns {NodeJS.ProcessEnv}
 */
export function mergeInfisicalEnvOptional(baseEnv, options = {}) {
  const infisicalCwd = options.infisicalCwd ?? appsWebRoot;
  const envName = (baseEnv.INFISICAL_ENV ?? process.env.INFISICAL_ENV)?.trim() || "dev";

  const linked = existsSync(join(infisicalCwd, ".infisical.json"));
  if (!linked) {
    console.warn(
      "[dev] No apps/web/.infisical.json — Infisical skipped. Run `infisical init` in apps/web once, or use apps/web/.env.local.",
    );
    return baseEnv;
  }

  try {
    execFileSync("infisical", ["--version"], {
      stdio: ["ignore", "ignore", "ignore"],
      cwd: infisicalCwd,
    });
  } catch {
    console.warn(
      "[dev] Infisical CLI not on PATH — skipped. Install CLI or rely on apps/web/.env.local.",
    );
    return baseEnv;
  }

  try {
    const platformSecrets = exportSecrets("/platform", envName, infisicalCwd);
    const myassistSecrets = exportSecrets("/myassist", envName, infisicalCwd);
    console.log("[dev] Infisical: merged /platform + /myassist into the dev environment.");
    return {
      ...baseEnv,
      ...platformSecrets,
      ...myassistSecrets,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[dev] Infisical export failed (${message}) — using .env.local and existing env.`);
    return baseEnv;
  }
}

export { appsWebRoot, repoRoot };
