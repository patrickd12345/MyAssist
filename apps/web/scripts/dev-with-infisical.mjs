import { execFileSync, spawn } from "node:child_process";

function exportSecrets(secretPath, envName) {
  const output = execFileSync(
    "infisical",
    ["export", "--env", envName, "--path", secretPath, "--format", "json"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const parsed = JSON.parse(output);
  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected Infisical export payload for path ${secretPath}`);
  }

  return Object.fromEntries(
    parsed
      .filter((entry) => entry && typeof entry.key === "string")
      .map((entry) => [entry.key, typeof entry.value === "string" ? entry.value : ""])
  );
}

function resolveEnvName() {
  return process.env.INFISICAL_ENV?.trim() || "dev";
}

function main() {
  const envName = resolveEnvName();
  const platformSecrets = exportSecrets("/platform", envName);
  const myassistSecrets = exportSecrets("/myassist", envName);
  const mergedEnv = {
    ...process.env,
    ...platformSecrets,
    ...myassistSecrets,
  };

  const child = spawn("pnpm", ["dev"], {
    env: mergedEnv,
    stdio: "inherit",
    shell: true,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(
    `[infisical] Failed to start MyAssist with merged /platform + /myassist secrets: ${message}`
  );
  process.exit(1);
}
