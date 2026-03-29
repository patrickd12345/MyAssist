import { tmpdir } from "node:os";
import path from "node:path";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";

/**
 * Root directory for file-backed MyAssist memory (rolling memory, daily snapshot, local integrations, etc.).
 * - Default locally: `<cwd>/.myassist-memory`
 * - On Vercel/serverless: `<tmpdir>/myassist-memory` (writable; ephemeral per instance)
 * - Override: `MYASSIST_MEMORY_ROOT` absolute path
 */
export function resolveMyAssistMemoryRoot(): string {
  const runtime = resolveMyAssistRuntimeEnv();
  const override = runtime.myassistMemoryRoot.trim();
  if (override) return path.resolve(override);
  if (process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV)) {
    return path.join(tmpdir(), "myassist-memory");
  }
  return path.join(process.cwd(), ".myassist-memory");
}

export function joinUnderMyAssistMemory(...segments: string[]): string {
  return path.join(resolveMyAssistMemoryRoot(), ...segments);
}
