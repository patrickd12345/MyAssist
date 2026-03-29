import "server-only";

import type { GmailSignal, JobHuntEmailMatch } from "./types";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";

export function defaultJobHuntSignalsUrl(): string {
  const runtime = resolveMyAssistRuntimeEnv();
  const d = runtime.jobHuntDigestUrl.trim();
  if (d) {
    try {
      const u = new URL(d);
      u.pathname = "/signals";
      return u.toString();
    } catch {
      /* ignore */
    }
  }
  return "http://127.0.0.1:3847/signals";
}

/**
 * POST Gmail signals to job-hunt-manager digest server for heuristic job matching and touchpoint logging.
 * Fails soft (empty array) if the digest server is down.
 */
export async function postJobHuntEmailSignals(signals: GmailSignal[]): Promise<JobHuntEmailMatch[]> {
  const runtime = resolveMyAssistRuntimeEnv();
  const disableSignals = runtime.myassistDisableJobHuntSignals;
  if (
    disableSignals === "1" ||
    disableSignals === "true"
  ) {
    return [];
  }
  if (runtime.nodeEnv === "test") {
    return [];
  }
  if (signals.length === 0) {
    return [];
  }

  const url = runtime.jobHuntSignalsUrl || defaultJobHuntSignalsUrl();
  const payload = {
    signals: signals.map((s) => ({
      id: s.id,
      threadId: s.threadId,
      from: typeof s.from === "string" ? s.from : String(s.from ?? ""),
      subject: s.subject,
      snippet: s.snippet,
      date: s.date,
      normalizedIdentity: s.job_hunt_analysis?.normalizedIdentity,
      stageAlias: s.job_hunt_analysis?.stageAlias,
      stageHintManager: s.job_hunt_analysis?.stageHintManager,
    })),
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timer);
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as { matches?: unknown };
    if (!Array.isArray(data.matches)) {
      return [];
    }
    return data.matches.filter(isJobHuntEmailMatch);
  } catch {
    return [];
  }
}

function isJobHuntEmailMatch(value: unknown): value is JobHuntEmailMatch {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.job_id !== "string" || typeof o.company !== "string" || typeof o.title !== "string") {
    return false;
  }
  if (typeof o.match_score !== "number" || typeof o.match_reason !== "string") return false;
  if (typeof o.touchpoint_logged !== "boolean") return false;
  if (o.signal !== undefined && (o.signal === null || typeof o.signal !== "object")) return false;
  return true;
}
