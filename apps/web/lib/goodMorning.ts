import "server-only";

import { withTimeout } from "./asyncTimeout";
import { executeChat } from "./aiRuntime";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import type { GoodMorningMessage, UnifiedDailyBriefing } from "./types";

const BUSY_MEETING_THRESHOLD = 4;

function goodMorningAiEnabled(): boolean {
  const v = resolveMyAssistRuntimeEnv().myassistDailyIntelAi.trim().toLowerCase();
  return v === "1" || v === "true";
}

/** Deterministic executive-style greeting from `UnifiedDailyBriefing` (no AI). Exported for tests. */
export function buildGoodMorningMessageDeterministic(briefing: UnifiedDailyBriefing): GoodMorningMessage {
  const generatedAt = new Date().toISOString();
  const urgentCount = briefing.counts.urgent;
  const meetingCount = briefing.calendar_events_in_view;
  const jobCount = briefing.counts.job_related;

  const segments: string[] = [];
  if (urgentCount > 0) {
    segments.push(
      `you have ${urgentCount} urgent item${urgentCount === 1 ? "" : "s"} today`,
    );
  }
  if (meetingCount >= BUSY_MEETING_THRESHOLD) {
    segments.push(`your schedule is busy today with ${meetingCount} meetings`);
  }
  if (jobCount > 0) {
    segments.push(
      `you have ${jobCount} job-related update${jobCount === 1 ? "" : "s"}`,
    );
  }
  if (segments.length === 0) {
    segments.push("your day looks relatively calm");
  }

  const message = `Good morning — ${segments.join(". ")}.`;
  return { message, tone: "neutral", generatedAt };
}

const DAILY_CONTEXT_AI_CHAT_TIMEOUT_MS = 60_000;

async function tryAiRewrite(briefing: UnifiedDailyBriefing, deterministicLine: string): Promise<string | null> {
  const res = await withTimeout(
    executeChat({
      temperature: 0.25,
      maxTokens: 120,
      messages: [
        {
          role: "system",
          content:
            "Rewrite the user's daily greeting as one short paragraph in the voice of an executive assistant. Keep facts and numbers. No markdown. No greeting to a name.",
        },
        {
          role: "user",
          content: JSON.stringify({
            deterministic_greeting: deterministicLine,
            urgent: briefing.counts.urgent,
            meetings: briefing.calendar_events_in_view,
            job_related: briefing.counts.job_related,
          }),
        },
      ],
    }),
    DAILY_CONTEXT_AI_CHAT_TIMEOUT_MS,
  );
  if (!res) return null;
  const line = res.text.trim();
  return line.length > 0 ? line : null;
}

/**
 * Builds a good-morning line from the unified briefing: deterministic first, optional AI rewrite via ai-core
 * when `MYASSIST_DAILY_INTEL_AI` is enabled; always falls back on disable or failure.
 */
export async function buildGoodMorningMessage(briefing: UnifiedDailyBriefing): Promise<GoodMorningMessage> {
  const base = buildGoodMorningMessageDeterministic(briefing);
  if (!goodMorningAiEnabled()) {
    return base;
  }
  try {
    const rewritten = await tryAiRewrite(briefing, base.message);
    if (rewritten) {
      return {
        message: rewritten,
        tone: "neutral",
        generatedAt: new Date().toISOString(),
      };
    }
  } catch {
    /* deterministic fallback */
  }
  return base;
}
