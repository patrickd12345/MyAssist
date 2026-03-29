import "server-only";

import type { LifecycleState } from "job-hunt-manager/types/lifecycle";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";

function dataPath(): string | undefined {
  return resolveMyAssistRuntimeEnv().jobHuntDataPath || undefined;
}

export async function appendJobTimelineNote(jobId: string, detail: string): Promise<LifecycleState> {
  const { HuntService } = await import("job-hunt-manager/services/hunt-service");
  const svc = new HuntService(dataPath());
  return svc.appendTimelineNote({ id: jobId, detail });
}

export async function updateJobStage(
  jobId: string,
  stage: string,
  opts?: { notes?: string },
): Promise<LifecycleState> {
  const { HuntService } = await import("job-hunt-manager/services/hunt-service");
  const svc = new HuntService(dataPath());
  return svc.updateJobProgress({ id: jobId, stage, notes: opts?.notes });
}
