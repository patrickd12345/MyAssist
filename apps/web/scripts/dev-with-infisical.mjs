import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeInfisicalEnvOptional } from "../../../scripts/infisical-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsWebRoot = join(__dirname, "..");

function main() {
  const mergedEnv = mergeInfisicalEnvOptional({ ...process.env });

  const child = spawn("pnpm", ["dev"], {
    env: mergedEnv,
    stdio: "inherit",
    shell: true,
    cwd: appsWebRoot,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

main();
