import type { UnifiedJob } from "../types/job.js";
import type { TrackDefinition } from "../types/tracks.js";

function scoreAgainstKeywords(text: string, keywords: string[]): number {
  const t = text.toLowerCase();
  let s = 0;
  for (const kw of keywords) {
    const k = kw.toLowerCase().trim();
    if (!k) continue;
    if (t.includes(k)) s += 3;
    const parts = k.split(/\s+/);
    if (parts.every((p) => t.includes(p))) s += 2;
  }
  return s;
}

export function classifyTrackForJob(job: UnifiedJob, tracks: TrackDefinition[]): {
  track_guess: string;
  confidence: number;
} {
  const active = tracks.filter((t) => !t.archived);
  const text = `${job.title} ${job.description} ${job.tags.join(" ")}`;
  let bestId = active[0]?.id ?? "ai_focus";
  let best = 0;
  for (const tr of active) {
    const sc = scoreAgainstKeywords(text, tr.default_keywords);
    if (sc > best) {
      best = sc;
      bestId = tr.id;
    }
  }
  const confidence = Math.min(1, best / 12);
  return { track_guess: bestId, confidence };
}

export function annotateTrackGuess(job: UnifiedJob, tracks: TrackDefinition[]): UnifiedJob {
  const { track_guess, confidence } = classifyTrackForJob(job, tracks);
  return {
    ...job,
    _track_guess: track_guess,
    _track_confidence: confidence,
  };
}
