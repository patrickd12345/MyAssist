import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveMemoryFilePath } from "@/lib/memoryStore";
import type { MyAssistDailyContext } from "@/lib/types";
import { isMyAssistDailyContext } from "@/lib/validateContext";

export type LastDashboardVisitRecord = {
  updated_at: string;
  snapshot: MyAssistDailyContext;
};

export function resolveLastDashboardVisitPath(userId: string): string {
  return path.join(path.dirname(resolveMemoryFilePath(userId)), "last-dashboard-visit.json");
}

export async function readLastDashboardVisit(userId: string): Promise<LastDashboardVisitRecord | null> {
  const file = resolveLastDashboardVisitPath(userId);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const rec = parsed as Record<string, unknown>;
    if (typeof rec.updated_at !== "string" || !isMyAssistDailyContext(rec.snapshot)) return null;
    return {
      updated_at: rec.updated_at,
      snapshot: rec.snapshot,
    };
  } catch {
    return null;
  }
}

export async function writeLastDashboardVisit(userId: string, context: MyAssistDailyContext): Promise<void> {
  const file = resolveLastDashboardVisitPath(userId);
  await mkdir(path.dirname(file), { recursive: true });
  const toStore = { ...context };
  delete toStore.user_task_nudges;
  const payload: LastDashboardVisitRecord = {
    updated_at: new Date().toISOString(),
    snapshot: toStore,
  };
  await writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}
