/**
 * Runs Next (web) + job-hunt digest together. Uses the `concurrently` **programmatic** API so
 * Windows does not break `pnpm --filter ...` (spawn + `pnpm exec concurrently` was splitting args).
 */
import concurrently from "concurrently";
import { mergeInfisicalEnvOptional, repoRoot } from "./infisical-merge.mjs";

const mergedEnv = mergeInfisicalEnvOptional({ ...process.env });
for (const [key, value] of Object.entries(mergedEnv)) {
  if (value !== undefined) {
    process.env[key] = value;
  }
}

const { result } = concurrently(
  ["pnpm --filter web run dev", "pnpm --filter job-hunt-manager run digest:dev"],
  {
    cwd: repoRoot,
    prefixColors: ["cyan", "magenta"],
  },
);

try {
  const exitInfos = await result;
  const failed = exitInfos.some((info) => (info.exitCode ?? 1) !== 0);
  process.exit(failed ? 1 : 0);
} catch {
  process.exit(1);
}
