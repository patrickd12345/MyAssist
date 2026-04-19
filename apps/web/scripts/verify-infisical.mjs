import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeInfisicalEnvStrict } from "../../../scripts/infisical-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsWebRoot = join(__dirname, "..");

function parseEnvName() {
  const arg = process.argv.find((value) => value.startsWith("--env="));
  if (arg) return arg.slice("--env=".length).trim() || "dev";
  return (process.env.INFISICAL_ENV ?? "").trim() || "dev";
}

function main() {
  const envName = parseEnvName();
  const productionLike = envName === "prod" || process.argv.includes("--production-like");

  try {
    const { mergedEnv, counts } = mergeInfisicalEnvStrict({ ...process.env }, { envName, infisicalCwd: appsWebRoot });
    console.log(
      `[verify:infisical] merged /platform (${counts.platform} keys) + /myassist (${counts.myassist} keys) for env ${envName}; secret values not printed.`,
    );

    const result = spawnSync(
      "pnpm",
      ["exec", "tsx", "scripts/check-env-readiness.ts", ...(productionLike ? ["--production-like"] : [])],
      {
        cwd: appsWebRoot,
        env: mergedEnv,
        stdio: "inherit",
        shell: true,
      },
    );

    process.exit(result.status ?? 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[verify:infisical] failed: ${message}`);
    process.exit(1);
  }
}

main();
