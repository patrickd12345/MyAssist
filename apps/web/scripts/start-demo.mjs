import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeInfisicalEnvOptional } from "../../../scripts/infisical-merge.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appsWebRoot = join(__dirname, "..");

const useInfisical = process.argv.includes("--infisical");

function ensureNodeHeap(env) {
  const next = { ...env };
  const heap = "--max-old-space-size=6144";
  const cur = (next.NODE_OPTIONS ?? "").trim();
  if (!cur.includes("max-old-space-size")) {
    next.NODE_OPTIONS = cur ? `${cur} ${heap}` : heap;
  }
  return next;
}

function main() {
  let env = ensureNodeHeap({ ...process.env, MYASSIST_DEMO_MODE: "true" });

  if (useInfisical) {
    env = mergeInfisicalEnvOptional(env);
    env.MYASSIST_DEMO_MODE = "true";
  }

  console.log(
    "[myassist:demo] MYASSIST_DEMO_MODE=true — curated Today context (no live Gmail/Calendar/Todoist reads).",
  );
  if (useInfisical) {
    console.log("[myassist:demo] Infisical merge enabled when CLI + apps/web/.infisical.json allow.");
  }
  console.log("[myassist:demo] Open http://localhost:3000 — presenter script: GET /api/demo-script\n");

  const child = spawn("pnpm", ["exec", "next", "dev"], {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
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
