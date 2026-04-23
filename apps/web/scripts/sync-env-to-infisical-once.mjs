/**
 * apps/web: sync .env.local → Infisical `/myassist` (env `dev` by default).
 * Run: node scripts/sync-env-to-infisical-once.mjs
 *   --all   set every key that has a non-empty value in .env.local (overwrites)
 *   (default) only set keys that are not yet in Infisical
 * Does not print secret values.
 * Documentation: ../../../docs/infisical-and-secrets.md (from this file)
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env.local");
const allMode = process.argv.includes("--all");

function parseEnv(text) {
  const out = new Map();
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    let v = t.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    out.set(k, v);
  }
  return out;
}

const local = parseEnv(readFileSync(envPath, "utf8"));
const withValue = [...local.keys()].filter((k) => local.get(k) !== "");
const raw = execFileSync(
  "infisical",
  ["secrets", "--path=/myassist", "--env=dev", "--output=json"],
  { encoding: "utf8", cwd: root, maxBuffer: 10 * 1024 * 1024 }
);
const remote = new Set(JSON.parse(raw).map((x) => x.secretKey));
const missing = withValue.filter((k) => !remote.has(k));
const toApply = allMode ? withValue : missing;

process.stdout.write(
  `Mode: ${allMode ? "all (overwrite)" : "missing only"}. Local with value: ${
    withValue.length
  }. Remote: ${remote.size}. Will apply: ${toApply.length}.\n`
);
if (toApply.length) {
  process.stdout.write(`Keys: ${toApply.join(", ")}\n`);
}

for (const k of toApply) {
  const value = local.get(k);
  if (value === "") continue;
  execFileSync(
    "infisical",
    [
      "secrets",
      "set",
      `${k}=${value}`,
      "--path=/myassist",
      "--env=dev",
      "--silent",
    ],
    { encoding: "utf8", cwd: root, stdio: ["ignore", "pipe", "inherit"] }
  );
  process.stdout.write(`Pushed: ${k}\n`);
}

if (toApply.length === 0) {
  process.stdout.write("Nothing to do.\n");
}
