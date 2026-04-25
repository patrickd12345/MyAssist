import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeInfisicalEnvStrict } from "../../../scripts/infisical-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsWebRoot = join(__dirname, "..");

function parseArgs() {
  const args = process.argv.slice(2);
  const separatorIndex = args.indexOf("--");
  const command = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

  if (command.length === 0) {
    throw new Error(
      "Missing command. Example: node scripts/run-with-infisical-prod.mjs -- pnpm run check:env:prod",
    );
  }

  return { command };
}

function explainInfisicalFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("ENOENT") ||
    message.includes("not recognized") ||
    message.includes("command not found") ||
    message.includes("spawnSync infisical")
  ) {
    return "Infisical CLI is unavailable. Install the Infisical CLI or set INFISICAL_CLI_EXECUTABLE to its path.";
  }
  if (
    message.toLowerCase().includes("unauthorized") ||
    message.toLowerCase().includes("not logged in") ||
    message.toLowerCase().includes("login") ||
    message.toLowerCase().includes("authentication")
  ) {
    return "Infisical CLI is not authenticated. Run `infisical login` or configure the approved machine identity.";
  }
  return message;
}

function main() {
  try {
    const { command } = parseArgs();
    const envName = "prod";
    const { mergedEnv, counts } = mergeInfisicalEnvStrict({ ...process.env }, { envName, infisicalCwd: appsWebRoot });

    console.log(
      `[run-with-infisical-prod] merged /platform (${counts.platform} keys) + /myassist (${counts.myassist} keys) for env ${envName}; secret values not printed.`,
    );
    console.log(`[run-with-infisical-prod] running: ${command.join(" ")}`);

    const result = spawnSync(command[0], command.slice(1), {
      cwd: appsWebRoot,
      env: mergedEnv,
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    process.exit(result.status ?? 1);
  } catch (error) {
    console.error(`[run-with-infisical-prod] failed: ${explainInfisicalFailure(error)}`);
    process.exit(1);
  }
}

main();
