import "server-only";

import { MYASSIST_CONTEXT_SOURCE_HEADER, type DailyContextSource } from "./dailyContextShared";
import { getMockDailyContext } from "./mockDailyContext";
import { syncContactsFromJobHuntEmailMatches } from "./jobHuntEmailAssignment";
import { postJobHuntEmailSignals } from "./jobHuntEmailSignals";
import { enrichGmailSignalsWithJobHuntAnalysis } from "./services/jobHuntIntelligenceService";
import { integrationService } from "./integrations/service";
import { getEmailTriageHints } from "./memoryStore";
import { fetchTodoistTaskRecordsForUser } from "./todoistApiTasks";
import { bucketTodoistTasksFromApi } from "./todoistTaskBuckets";
import type { MyAssistDailyContext } from "./types";
import { executeChat } from "./aiRuntime";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import { logServerEvent } from "./serverLog";

export type { DailyContextSource };
export { MYASSIST_CONTEXT_SOURCE_HEADER };
const EMAIL_IMPORTANCE_TIMEOUT_MS = 60000;

function shouldUseMockContext(): boolean {
  const runtime = resolveMyAssistRuntimeEnv();
  const v = runtime.myassistUseMockContext.trim().toLowerCase();
  return v === "1" || v === "true";
}

async function fetchTodoistSlicesForUser(
  userId: string,
): Promise<Pick<
  MyAssistDailyContext,
  "todoist_overdue" | "todoist_due_today" | "todoist_upcoming_high_priority"
> | null> {
  const tasks = await fetchTodoistTaskRecordsForUser(userId);
  if (tasks === null) return null;
  return bucketTodoistTasksFromApi(tasks);
}

function mapCalendarFromOAuth(raw: Array<Record<string, unknown>>): MyAssistDailyContext["calendar_today"] {
  return raw.map((e) => {
    const startObj = (e.start as Record<string, unknown> | undefined) || {};
    const endObj = (e.end as Record<string, unknown> | undefined) || {};
    return {
      id: typeof e.id === "string" ? e.id : null,
      summary: typeof e.summary === "string" ? e.summary : "(untitled event)",
      start:
        (typeof startObj.dateTime === "string" && startObj.dateTime) ||
        (typeof startObj.date === "string" && startObj.date) ||
        null,
      end:
        (typeof endObj.dateTime === "string" && endObj.dateTime) ||
        (typeof endObj.date === "string" && endObj.date) ||
        null,
      location: typeof e.location === "string" ? e.location : null,
    };
  });
}

function mapGmailFromOAuth(raw: Array<Record<string, unknown>>): MyAssistDailyContext["gmail_signals"] {
  return raw.map((g) => {
    const labelRaw = g.label_ids;
    const label_ids =
      Array.isArray(labelRaw) && labelRaw.every((x) => typeof x === "string")
        ? (labelRaw as string[])
        : undefined;
    return {
      id: (typeof g.id === "string" ? g.id : null) ?? null,
      threadId: (typeof g.threadId === "string" ? g.threadId : null) ?? null,
      from: flattenText(g.from),
      subject: flattenText(g.subject),
      snippet: flattenText(g.snippet),
      date: typeof g.date === "string" ? g.date : flattenText(g.date),
      ...(label_ids ? { label_ids } : {}),
    };
  });
}

/**
 * Builds daily context from live Gmail, Google Calendar, and Todoist reads (providers are source of truth).
 * Uses mock data only when MYASSIST_USE_MOCK_CONTEXT is true.
 */
export async function fetchDailyContextLive(userId: string | null): Promise<{
  context: MyAssistDailyContext;
  source: DailyContextSource;
}> {
  if (shouldUseMockContext()) {
    return { context: enrichGmailSignalsWithJobHuntAnalysis(getMockDailyContext()), source: "mock" };
  }

  const trimmed = userId?.trim() ?? "";
  if (!trimmed) {
    throw new Error("Daily context requires a signed-in user. Connect Gmail, Calendar, and Todoist after signing in.");
  }

  const [gmailRaw, calendarRaw, todoistSlices] = await Promise.all([
    integrationService.fetchGmailSignals(trimmed),
    integrationService.fetchCalendarEvents(trimmed),
    fetchTodoistSlicesForUser(trimmed),
  ]);

  const gmail_signals = gmailRaw ? mapGmailFromOAuth(gmailRaw) : [];
  const calendar_today = Array.isArray(calendarRaw) ? mapCalendarFromOAuth(calendarRaw) : [];

  const now = new Date().toISOString();
  const run_date = now.slice(0, 10);

  let base: MyAssistDailyContext = {
    generated_at: now,
    run_date,
    gmail_signals,
    calendar_today,
    todoist_overdue: todoistSlices?.todoist_overdue ?? [],
    todoist_due_today: todoistSlices?.todoist_due_today ?? [],
    todoist_upcoming_high_priority: todoistSlices?.todoist_upcoming_high_priority ?? [],
  };

  base = flattenGmailSignals(base);
  const prioritized = await prioritizeContextEmails(base, trimmed);
  const withJobHuntAnalysis = enrichGmailSignalsWithJobHuntAnalysis(prioritized);
  const job_hunt_email_matches = await postJobHuntEmailSignals(withJobHuntAnalysis.gmail_signals);
  if (trimmed && job_hunt_email_matches.length > 0) {
    await syncContactsFromJobHuntEmailMatches(trimmed, job_hunt_email_matches);
  }

  return {
    context: {
      ...withJobHuntAnalysis,
      ...(job_hunt_email_matches.length > 0 ? { job_hunt_email_matches } : {}),
    },
    source: "live",
  };
}

const NO_SUBJECT_PLACEHOLDER = /^\(no subject\)$/i;

/** Prefer real Subject headers; fall back to first line of snippet when missing or placeholder. */
export function resolveGmailSubject(subject: string, snippet: string): string {
  const s = subject.trim();
  if (s && !NO_SUBJECT_PLACEHOLDER.test(s)) return s;
  return firstLineFromSnippet(snippet) || "(no subject)";
}

function firstLineFromSnippet(snippet: string): string {
  const rawFirst = snippet.split(/\r?\n/)[0]?.trim() ?? "";
  if (!rawFirst) return "";
  const line = rawFirst.replace(/\s+/g, " ").trim();
  return line.length > 120 ? `${line.slice(0, 117)}...` : line;
}

function flattenGmailSignals(context: MyAssistDailyContext): MyAssistDailyContext {
  const normalized: MyAssistDailyContext = {
    ...context,
    gmail_signals: context.gmail_signals.map((signal) => {
      const snippet = flattenText(signal.snippet);
      return {
        ...signal,
        from: flattenText(signal.from),
        subject: resolveGmailSubject(flattenText(signal.subject), snippet),
        snippet,
      };
    }),
  };
  return normalized;
}

export type EmailTriageHints = { junk: string[]; useful: string[] };

function buildEmailTriageHintBlock(hints?: EmailTriageHints): string {
  if (!hints) return "";
  const junk = hints.junk.filter(Boolean);
  const useful = hints.useful.filter(Boolean);
  if (junk.length === 0 && useful.length === 0) return "";
  const parts: string[] = [];
  if (junk.length > 0) {
    parts.push(
      `User previously dismissed similar items as junk — strongly deprioritize emails that resemble these themes or senders: ${junk.slice(0, 12).join(" | ")}`,
    );
  }
  if (useful.length > 0) {
    parts.push(
      `User previously marked similar items as real work — boost when the new email aligns with these: ${useful.slice(0, 12).join(" | ")}`,
    );
  }
  return parts.join(" ");
}

async function prioritizeContextEmails(
  context: MyAssistDailyContext,
  userId?: string,
): Promise<MyAssistDailyContext> {
  let hints: EmailTriageHints | undefined;
  if (userId?.trim()) {
    hints = await getEmailTriageHints(userId.trim());
  }
  const prioritizedSignals = await prioritizeGmailSignalsWithAi(context.gmail_signals, hints);
  return {
    ...context,
    gmail_signals: prioritizedSignals,
  };
}

type RankedEmail = {
  index: number;
  importance: number;
  reason?: string;
};

export async function prioritizeGmailSignalsWithAi(
  signals: MyAssistDailyContext["gmail_signals"],
  triageHints?: EmailTriageHints,
): Promise<MyAssistDailyContext["gmail_signals"]> {
  const runtime = resolveMyAssistRuntimeEnv();
  if (runtime.myassistEnableEmailImportanceAi === "0") return signals;
  if (signals.length <= 1) return signals;

  const keyed = signals.map((signal, index) => ({
    signal,
    index,
  }));

  const payload = keyed.map((entry) => ({
    index: entry.index,
    from: flattenText(entry.signal.from),
    subject: flattenText(entry.signal.subject),
    snippet: flattenText(entry.signal.snippet).slice(0, 220),
    date: flattenText(entry.signal.date),
  }));

  const hintBlock = buildEmailTriageHintBlock(triageHints);

  for (const model of getEmailImportanceModels()) {
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("email_importance_timeout")), EMAIL_IMPORTANCE_TIMEOUT_MS),
      );
      const aiPromise = executeChat({
        model,
        format: "json",
        temperature: 0.1,
        maxTokens: 420,
        messages: [
          {
            role: "system",
            content: [
              "Rank email importance for immediate action planning.",
              "Assess from sender, subject, snippet, and timing context.",
              "Do not use fixed keyword rules; infer urgency and consequence from context.",
              "Use this rubric: prioritize concrete action requests, human-to-human messages, explicit deadlines/consequences, and high-stakes blockers.",
              "Strongly deprioritize marketing/newsletter/survey/promotional language even when words like 'important' or 'urgent' appear.",
              "Treat generic corporate copy (feedback requests, promotional alerts, campaigns, announcements) as low importance unless there is a concrete consequence.",
              "Do not over-score clickbait urgency words without specific action or consequences.",
              hintBlock,
              "Return strict JSON: { ranked: [{ index: number, importance: number, reason: string }] }",
              "reason must be 2-6 words, concrete, and non-generic.",
              "reason must explain importance, never quote or copy email subject/snippet text.",
              "Include every index exactly once if possible.",
              "importance is 0-100. Higher means more urgent/important right now.",
            ]
              .filter((line) => line.trim() !== "")
              .join(" "),
          },
          {
            role: "user",
            content: JSON.stringify({ emails: payload }),
          },
        ],
      });
      const result = await Promise.race([aiPromise, timeoutPromise]);
      const raw = result.text;
      const ranked = parseRankedEmails(raw);
      if (ranked.length === 0) continue;
      const scoreByIndex = new Map(ranked.map((item) => [item.index, item.importance]));
      const reasonByIndex = new Map(ranked.map((item) => [item.index, item.reason ?? ""]));
      return [...keyed]
        .sort((a, b) => {
          const scoreA = scoreByIndex.get(a.index) ?? Number.NEGATIVE_INFINITY;
          const scoreB = scoreByIndex.get(b.index) ?? Number.NEGATIVE_INFINITY;
          if (scoreA !== scoreB) return scoreB - scoreA;
          const dateA = safeDateValue(a.signal.date);
          const dateB = safeDateValue(b.signal.date);
          if (dateA !== dateB) return dateB - dateA;
          return a.index - b.index;
        })
        .map((entry) => ({
          ...entry.signal,
          importance_score: scoreByIndex.get(entry.index),
          importance_reason: coerceImportanceReason(
            reasonByIndex.get(entry.index) || "",
            entry.signal.subject,
            entry.signal.snippet,
            scoreByIndex.get(entry.index),
          ),
          importance_model: model,
        }));
    } catch (e) {
      logServerEvent("warn", "myassist_email_ranking_model_failed", {
        model,
        error: e instanceof Error ? e.message : String(e),
      });
      continue;
    }
  }

  logServerEvent("warn", "myassist_email_ranking_all_models_failed");
  return signals;
}

function getEmailImportanceModels(): string[] {
  const runtime = resolveMyAssistRuntimeEnv();
  const fromEnv = runtime.ollamaEmailImportanceModels.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .filter((model, index, array) => array.indexOf(model) === index);
  }
  return [
    runtime.ollamaEmailImportanceModel.trim() || "",
    "mistral:latest",
    "qwen2.5:1.5b",
    "qwen2.5:0.5b",
    runtime.ollamaModel,
    "tinyllama:latest",
  ].filter((model, index, array) => Boolean(model) && array.indexOf(model) === index);
}

function parseRankedEmails(raw: string): RankedEmail[] {
  const text = raw.trim();
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as {
      ranked?: Array<{ index?: unknown; importance?: unknown; reason?: unknown }>;
    };
    if (!Array.isArray(parsed.ranked)) return [];
    const results: RankedEmail[] = [];
    for (const item of parsed.ranked) {
      const indexRaw =
        typeof item.index === "number"
          ? item.index
          : typeof item.index === "string"
            ? Number(item.index)
            : NaN;
      const importanceRaw =
        typeof item.importance === "number"
          ? item.importance
          : typeof item.importance === "string"
            ? Number(item.importance)
            : NaN;
      if (!Number.isInteger(indexRaw) || indexRaw < 0 || !Number.isFinite(importanceRaw)) continue;
      const importance = Math.max(0, Math.min(100, Math.round(importanceRaw)));
      const reason =
        typeof item.reason === "string"
          ? item.reason.replace(/\s+/g, " ").trim().slice(0, 72)
          : "";
      results.push({ index: indexRaw, importance, reason });
    }
    return results;
  } catch {
    return [];
  }
}

function safeDateValue(value: string | null): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

function coerceImportanceReason(
  candidate: string,
  subject: string,
  snippet: string,
  score?: number,
): string {
  const trimmed = candidate.replace(/\s+/g, " ").trim();
  const normalizedCandidate = normalizeReasonText(trimmed);
  const normalizedSubject = normalizeReasonText(subject);
  const normalizedSnippet = normalizeReasonText(snippet);

  if (normalizedCandidate.length >= 6) {
    const echoesSubject = normalizedSubject && normalizedCandidate.includes(normalizedSubject);
    const echoesSnippet = normalizedSnippet && normalizedSnippet.includes(normalizedCandidate);
    if (!echoesSubject && !echoesSnippet) {
      return trimmed;
    }
  }

  const s = typeof score === "number" ? score : 0;
  if (s >= 85) return "immediate action likely required";
  if (s >= 65) return "likely time-sensitive commitment";
  if (s >= 45) return "moderate operational relevance";
  return "lower immediate consequence";
}

function normalizeReasonText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => flattenText(item)).filter(Boolean).join(" ");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const priorityFields = ["text", "value", "html"];
    for (const key of priorityFields) {
      if (key in obj) {
        const typed = flattenText(obj[key]);
        if (typed) return typed;
      }
    }
    return Object.values(obj)
      .map((item) => flattenText(item))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}
