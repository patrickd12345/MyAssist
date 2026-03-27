import type { GmailSignal } from "./types";

/** Aligns with job-hunt panel visibility in Dashboard (presentation-only). */
export const INBOX_JOB_HUNT_MIN_CONFIDENCE = 0.4;

/** AI-ranked importance (Ollama); at or above → show in Priority section. */
export const INBOX_PRIORITY_IMPORTANCE_MIN = 60;

/**
 * Presentation-only: provider data stays in `gmail_signals`. Used to split Inbox into
 * Priority vs Recent without a second fetch or mirror.
 */
export function isPriorityInboxEmail(signal: GmailSignal): boolean {
  const jh = signal.job_hunt_analysis;
  if (
    jh &&
    jh.confidence >= INBOX_JOB_HUNT_MIN_CONFIDENCE &&
    Array.isArray(jh.signals) &&
    jh.signals.length > 0
  ) {
    return true;
  }
  if (typeof signal.importance_score === "number" && signal.importance_score >= INBOX_PRIORITY_IMPORTANCE_MIN) {
    return true;
  }
  return false;
}

export function inboxPriorityBadge(signal: GmailSignal): "Signals" | "Priority" | null {
  if (!isPriorityInboxEmail(signal)) return null;
  const jh = signal.job_hunt_analysis;
  if (
    jh &&
    jh.confidence >= INBOX_JOB_HUNT_MIN_CONFIDENCE &&
    Array.isArray(jh.signals) &&
    jh.signals.length > 0
  ) {
    return "Signals";
  }
  return "Priority";
}

export function splitInboxEmails(signals: GmailSignal[]): {
  priority: GmailSignal[];
  recent: GmailSignal[];
} {
  const priority: GmailSignal[] = [];
  const recent: GmailSignal[] = [];
  for (const s of signals) {
    if (isPriorityInboxEmail(s)) priority.push(s);
    else recent.push(s);
  }
  return { priority, recent };
}
