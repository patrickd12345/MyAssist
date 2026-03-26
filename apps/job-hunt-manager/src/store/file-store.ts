import { existsSync, mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import lockfile from "proper-lockfile";
import type { UnifiedJob } from "../types/job.js";
import type { LifecycleState, SavedLead, TouchpointRecord, TranscriptRecord } from "../types/lifecycle.js";
import type { TrackDefinition } from "../types/tracks.js";

export type PersistedStateV1 = {
  version: 1;
  userTracks: TrackDefinition[];
  jobIndex: Record<string, UnifiedJob>;
  saved: Record<string, SavedLead>;
  lifecycle: Record<string, LifecycleState>;
  transcripts: Record<string, TranscriptRecord[]>;
  touchpoints: Record<string, TouchpointRecord[]>;
};

export function defaultDataPath(): string {
  return process.env.JOB_HUNT_DATA_PATH ?? join(homedir(), ".job-hunt-manager", "store.json");
}

export function emptyState(): PersistedStateV1 {
  return {
    version: 1,
    userTracks: [],
    jobIndex: {},
    saved: {},
    lifecycle: {},
    transcripts: {},
    touchpoints: {},
  };
}

function lockFilePath(dataPath: string): string {
  return `${dataPath}.lock`;
}

async function ensureLockFile(lockPath: string): Promise<void> {
  const dir = dirname(lockPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  if (!existsSync(lockPath)) {
    await writeFile(lockPath, "", "utf8");
  }
}

async function withStoreLock<T>(dataPath: string, fn: () => Promise<T>): Promise<T> {
  const lockPath = lockFilePath(dataPath);
  await ensureLockFile(lockPath);
  const release = await lockfile.lock(lockPath, {
    retries: { retries: 5, minTimeout: 100 },
  });
  try {
    return await fn();
  } finally {
    await release();
  }
}

export async function loadState(path = defaultDataPath()): Promise<PersistedStateV1> {
  return withStoreLock(path, async () => {
    if (!existsSync(path)) {
      return emptyState();
    }
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as PersistedStateV1;
      if (parsed.version !== 1) return emptyState();
      return {
        ...emptyState(),
        ...parsed,
        userTracks: parsed.userTracks ?? [],
        jobIndex: parsed.jobIndex ?? {},
        saved: parsed.saved ?? {},
        lifecycle: parsed.lifecycle ?? {},
        transcripts: parsed.transcripts ?? {},
        touchpoints: parsed.touchpoints ?? {},
      };
    } catch {
      return emptyState();
    }
  });
}

export async function saveState(state: PersistedStateV1, path = defaultDataPath()): Promise<void> {
  await withStoreLock(path, async () => {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(path, JSON.stringify(state, null, 2), "utf8");
  });
}
