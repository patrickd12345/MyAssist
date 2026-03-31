/**
 * Deterministic, rule-based signals on top of GmailNormalizedMessage (no LLM, no persistence).
 */

import type { GmailNormalizedMessage } from "./gmailNormalize";

export type GmailPhaseBSignalType =
  | "job_interview"
  | "job_recruiter"
  | "job_application"
  | "job_offer"
  | "job_rejection"
  | "job_related"
  | "important"
  | "action_required"
  | "calendar_related";

export type GmailPhaseBSignal = {
  messageId: string;
  type: GmailPhaseBSignalType;
  /** 0–1 heuristic strength (not statistical). */
  confidence: number;
  reason: string;
  extractedDate?: string;
  extractedEntities?: Record<string, string>;
};

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function combinedText(m: GmailNormalizedMessage): string {
  return `${m.subject}\n${m.snippet}\n${m.from}`.toLowerCase();
}

/** Very small date hints for scheduling / offers (best-effort). */
function extractLooseDate(text: string): string | undefined {
  const iso = text.match(/\b20\d{2}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const us = text.match(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/);
  if (us) return us[0];
  return undefined;
}

function push(
  out: GmailPhaseBSignal[],
  messageId: string,
  type: GmailPhaseBSignalType,
  confidence: number,
  reason: string,
  extra?: { extractedDate?: string; extractedEntities?: Record<string, string> },
): void {
  out.push({
    messageId,
    type,
    confidence: clamp01(confidence),
    reason,
    ...extra,
  });
}

function dedupeByMessageAndType(signals: GmailPhaseBSignal[]): GmailPhaseBSignal[] {
  const map = new Map<string, GmailPhaseBSignal>();
  for (const s of signals) {
    const key = `${s.messageId}\0${s.type}`;
    const prev = map.get(key);
    if (!prev || s.confidence > prev.confidence) map.set(key, s);
  }
  return [...map.values()];
}

/**
 * Synchronous rule pass over normalized Gmail rows. Multiple signals per message are allowed
 * (e.g. job interview + calendar + action required).
 */
export function detectSignals(messages: GmailNormalizedMessage[]): GmailPhaseBSignal[] {
  const out: GmailPhaseBSignal[] = [];

  for (const m of messages) {
    const mid = m.messageId.trim();
    if (!mid) continue;

    const text = combinedText(m);
    const dateHint = extractLooseDate(`${m.subject} ${m.snippet}`);

    // --- Job family (order: specific first) ---
    if (/\binterview\b|phone screen|technical screen|onsite|on-site|video interview/.test(text)) {
      push(out, mid, "job_interview", 0.72, "keywords_interview_scheduling", {
        extractedDate: dateHint,
        extractedEntities: { pattern: "interview" },
      });
    }
    if (/recruiter|recruiting|talent acquisition|sourcer|\bheadhunter\b/.test(text) || /@.*\.linkedin\.com/.test(text)) {
      push(out, mid, "job_recruiter", 0.68, "keywords_recruiter_or_talent", {});
    }
    if (/\bapplication\b|applied for|your application|status of your application|re: your application/.test(text)) {
      push(out, mid, "job_application", 0.65, "keywords_application_status", {});
    }
    if (/\boffer\b|offer letter|compensation discussion|start date|signing bonus/.test(text)) {
      push(out, mid, "job_offer", 0.62, "keywords_offer", { extractedDate: dateHint });
    }
    if (
      /unfortunately|not (?:to )?move forward|other candidates|position has been filled|not selected|reject(ed)?\b|regret to inform/.test(
        text,
      )
    ) {
      push(out, mid, "job_rejection", 0.7, "keywords_rejection", {});
    }
    if (/\b(hiring|position|resume|cv|job opening|we are looking for)\b/.test(text)) {
      push(out, mid, "job_related", 0.45, "keywords_job_general", {});
    }

    // --- Important ---
    let importantScore = 0.42;
    const importantReasons: string[] = [];
    if (m.important) {
      importantScore += 0.18;
      importantReasons.push("gmail_important_label");
    }
    if (m.unread) {
      importantScore += 0.1;
      importantReasons.push("unread");
    }
    if (/\burgent\b|\basap\b|time-sensitive|action needed|read carefully/.test(text)) {
      importantScore += 0.15;
      importantReasons.push("keywords_urgent");
    }
    if (importantReasons.length > 0) {
      push(out, mid, "important", importantScore, importantReasons.join("+"), {});
    }

    // --- Action required ---
    const hasActionRequest =
      /\b(please confirm|please reply|please let us know|rsvp|confirm your|pick a time|your availability|book a slot)\b/.test(
        text,
      ) ||
      (/\bplease\b/.test(text) && /\b(confirm|reply|schedule)\b/.test(text)) ||
      /\bschedule (?:a |an |the )?(?:call|meeting|time)\b/.test(text);
    if (hasActionRequest) {
      push(out, mid, "action_required", 0.58, "keywords_action_or_scheduling_request", {
        extractedDate: dateHint,
      });
    }

    // --- Calendar / scheduling (coordination, not only job) ---
    if (
      /calendly|when2meet|doodle|zoom\.us|teams\.microsoft|google meet|meet\.google|schedule (?:a |the )?(?:call|meeting)|meeting request|calendar invite|ics attachment/.test(
        text,
      ) ||
      /\bcoordination\b.*\b(meeting|call|interview)\b/.test(text)
    ) {
      push(out, mid, "calendar_related", 0.6, "keywords_scheduling_tool_or_meeting", {
        extractedDate: dateHint,
      });
    }
  }

  return dedupeByMessageAndType(out);
}
