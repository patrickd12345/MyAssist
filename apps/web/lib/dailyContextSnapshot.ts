import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveMemoryFilePath } from "@/lib/memoryStore";
import type { MyAssistDailyContext } from "@/lib/types";
import { isMyAssistDailyContext } from "@/lib/validateContext";

export function resolveDailyContextSnapshotPath(userId: string): string {
  return path.join(path.dirname(resolveMemoryFilePath(userId)), "last-daily-context.json");
}

export async function readLastDailyContext(userId: string): Promise<MyAssistDailyContext | null> {
  const file = resolveDailyContextSnapshotPath(userId);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isMyAssistDailyContext(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeLastDailyContext(
  userId: string,
  context: MyAssistDailyContext,
): Promise<void> {
  const file = resolveDailyContextSnapshotPath(userId);
  try {
    await mkdir(path.dirname(file), { recursive: true });
    const toStore = { ...context };
    delete toStore.user_task_nudges;
    await writeFile(file, `${JSON.stringify(toStore, null, 2)}\n`, "utf8");
  } catch (e) {
    console.warn("[dailyContextSnapshot] writeLastDailyContext skipped:", e);
  }
}
