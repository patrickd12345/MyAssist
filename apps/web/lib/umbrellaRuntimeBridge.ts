import { spawn } from "node:child_process";
import { join } from "node:path";
import type { SessionBoundaryPayload } from "@bookiji-inc/persistent-memory-runtime";

/**
 * Optional one-way bridge: MyAssist runtime boundary JSON → umbrella `commitSession('myassist', delta)`.
 * Opt-in: MYASSIST_UMBRELLA_MEMORY_BRIDGE=1 and BOOKIJI_INC_ROOT=<absolute path to Bookiji-inc workspace root>.
 * No reverse sync; no background queue.
 */
export function shouldBridgeMyAssistToUmbrella(env: NodeJS.ProcessEnv): boolean {
  return env.MYASSIST_UMBRELLA_MEMORY_BRIDGE === "1" && Boolean(env.BOOKIJI_INC_ROOT?.trim());
}

export function bridgeMyAssistRuntimeToUmbrella(
  env: NodeJS.ProcessEnv,
  boundary: SessionBoundaryPayload,
): Promise<void> {
  const root = env.BOOKIJI_INC_ROOT?.trim();
  if (!root) {
    return Promise.resolve();
  }
  const payload = `${JSON.stringify(boundary)}\n`;
  const tsxCli = join(root, "node_modules/tsx/dist/cli.mjs");
  const bridgeScript = join(root, "scripts/commit-myassist-bridge-to-umbrella.ts");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCli, bridgeScript], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stderr = "";
    child.stderr?.on("data", (c) => {
      stderr += String(c);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`umbrella bridge exited ${code}: ${stderr.trim()}`));
      }
    });
    child.stdin?.write(payload, "utf8", () => {
      child.stdin?.end();
    });
  });
}
