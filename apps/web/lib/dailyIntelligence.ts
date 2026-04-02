import "server-only";

import { withTimeout } from "./asyncTimeout";
import { executeChat } from "./aiRuntime";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import type { GmailPhaseBSignalType } from "./integrations/gmailSignalDetection";
import type { DailyIntelligence, DailyIntelligenceSummary, GmailSignal } from "./types";

const JOB_TYPES: GmailPhaseBSignalType[] = [
  "job_interview",
  "job_recruiter",
  "job_application",
  "job_offer",
  "job_rejection",
  "job_related",
];

const RANK_WEIGHT: Partial<Record<GmailPhaseBSignalType, number>> = {
  job_offer: 100,
  job_interview: 85,
  job_rejection: 80,
  job_recruiter: 65,
  job_application: 62,
  job_related: 45,
  action_required: 50,
  important: 40,
  calendar_related: 38,
};

function phaseTypes(s: GmailSignal): Set<GmailPhaseBSignalType> {
  const out = new Set<GmailPhaseBSignalType>();
  for (const p of s.phase_b_signals ?? []) {
    out.add(p.type);
  }
  return out;
}

/** Deterministic priority score for ordering (higher = more important). */
export function rankScoreGmailSignal(s: GmailSignal): number {
  let max = 0;
  for (const p of s.phase_b_signals ?? []) {
    const w = RANK_WEIGHT[p.type] ?? 0;
    max = Math.max(max, w * p.confidence);
  }
  if (s.label_ids?.includes("UNREAD")) max += 3;
  return max;
}

function isUrgent(s: GmailSignal): boolean {
  const t = phaseTypes(s);
  if (t.has("job_rejection")) return true;
  if (t.has("job_offer") && t.has("action_required")) return true;
  if (t.has("job_interview") && t.has("action_required")) return true;
  return false;
}

function isJobRelated(s: GmailSignal): boolean {
  const t = phaseTypes(s);
  for (const j of JOB_TYPES) {
    if (t.has(j)) return true;
  }
  return false;
}

function sortByRank(signals: GmailSignal[]): GmailSignal[] {
  return [...signals].sort((a, b) => rankScoreGmailSignal(b) - rankScoreGmailSignal(a));
}

/** Stable dedupe when the same Gmail row appears twice in the batch (e.g. aggregation). */
function dedupeSignalsByMessageId(signals: GmailSignal[]): GmailSignal[] {
  const seen = new Set<string>();
  const out: GmailSignal[] = [];
  for (const s of signals) {
    const key = s.id?.trim() || "";
    if (key) {
      if (seen.has(key)) continue;
      seen.add(key);
    }
    out.push(s);
  }
  return out;
}

function countsByPhaseType(signals: GmailSignal[]): Partial<Record<GmailPhaseBSignalType, number>> {
  const counts: Partial<Record<GmailPhaseBSignalType, number>> = {};
  for (const s of signals) {
    for (const p of s.phase_b_signals ?? []) {
      counts[p.type] = (counts[p.type] ?? 0) + 1;
    }
  }
  return counts;
}

function topPriorityLines(signals: GmailSignal[], limit: number): string[] {
  const sorted = sortByRank(signals);
  return sorted.slice(0, limit).map((s) => {
    const sub = s.subject.trim() || s.snippet.split(/\r?\n/)[0]?.trim() || "(no subject)";
    return sub.length > 100 ? `${sub.slice(0, 97)}...` : sub;
  });
}

/**
 * Stateless deterministic buckets + summary from Phase B signals (no AI).
 */
export function buildDailyIntelligence(signals: GmailSignal[]): DailyIntelligence {
  signals = dedupeSignalsByMessageId(signals);

  if (signals.length === 0) {
    const emptySummary: DailyIntelligenceSummary = {
      countsByType: {},
      topPriorities: [],
      generatedDeterministicSummary: "No Gmail messages in today's context.",
    };
    return {
      urgent: [],
      important: [],
      action_required: [],
      job_related: [],
      calendar_related: [],
      summary: emptySummary,
    };
  }

  const urgent: GmailSignal[] = [];
  const important: GmailSignal[] = [];
  const action_required: GmailSignal[] = [];
  const job_related: GmailSignal[] = [];
  const calendar_related: GmailSignal[] = [];

  for (const s of signals) {
    const t = phaseTypes(s);
    if (t.size === 0) continue;
    if (isUrgent(s)) urgent.push(s);
    if (t.has("important")) important.push(s);
    if (t.has("action_required")) action_required.push(s);
    if (isJobRelated(s)) job_related.push(s);
    if (t.has("calendar_related")) calendar_related.push(s);
  }

  const countsByType = countsByPhaseType(signals);
  const allRanked = sortByRank(signals.filter((x) => (x.phase_b_signals?.length ?? 0) > 0));
  const topPriorities = topPriorityLines(allRanked, 5);

  const totalTagged = Object.values(countsByType).reduce((a, b) => a + (b ?? 0), 0);
  let generatedDeterministicSummary: string;
  if (totalTagged === 0) {
    generatedDeterministicSummary =
      "No Phase B signal tags on inbox rows. Connect Gmail or expand detection rules when ready.";
  } else {
    const parts: string[] = [
      `Urgent: ${urgent.length}. Important: ${important.length}. Action required: ${action_required.length}. Job-related: ${job_related.length}. Calendar-related: ${calendar_related.length}.`,
    ];
    if (topPriorities.length > 0) {
      parts.push(`Top subjects: ${topPriorities.join(" | ")}`);
    }
    generatedDeterministicSummary = parts.join("\n");
  }

  const summary: DailyIntelligenceSummary = {
    countsByType,
    topPriorities,
    generatedDeterministicSummary,
  };

  return {
    urgent: sortByRank(urgent),
    important: sortByRank(important),
    action_required: sortByRank(action_required),
    job_related: sortByRank(job_related),
    calendar_related: sortByRank(calendar_related),
    summary,
  };
}

function dailyIntelAiEnabled(): boolean {
  const v = resolveMyAssistRuntimeEnv().myassistDailyIntelAi.trim().toLowerCase();
  return v === "1" || v === "true";
}

const DAILY_INTELLIGENCE_AI_TIMEOUT_MS = 60_000;

function hasMeaningfulDailyIntelContent(intel: DailyIntelligence): boolean {
  return (
    intel.urgent.length > 0 ||
    intel.important.length > 0 ||
    intel.action_required.length > 0 ||
    intel.job_related.length > 0 ||
    intel.calendar_related.length > 0 ||
    intel.summary.topPriorities.length > 0
  );
}

/**
 * Optional ai-runtime one-liner via `@bookiji-inc/ai-runtime` (executeChat). Never required; on failure or when disabled, returns input unchanged.
 */
export async function enrichDailyIntelligenceWithAi(intel: DailyIntelligence): Promise<DailyIntelligence> {
  if (!dailyIntelAiEnabled()) return intel;
  if (!hasMeaningfulDailyIntelContent(intel)) return intel;
  try {
    const res = await withTimeout(
      executeChat({
        messages: [
          {
            role: "system",
            content:
              "Summarize the email triage snapshot in 2-3 short sentences. Stay generic; avoid repeating personal names. If counts are all zero, say there is nothing notable.",
          },
          {
            role: "user",
            content: JSON.stringify({
              deterministic: intel.summary.generatedDeterministicSummary,
              countsByType: intel.summary.countsByType,
              topPriorities: intel.summary.topPriorities,
            }),
          },
        ],
        temperature: 0.2,
        maxTokens: 220,
      }),
      DAILY_INTELLIGENCE_AI_TIMEOUT_MS,
    );
    if (!res) return intel;
    const line = res.text.trim();
    if (!line) return intel;
    return {
      ...intel,
      summary: { ...intel.summary, aiSummary: line },
    };
  } catch {
    return intel;
  }
}
