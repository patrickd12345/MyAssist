import "server-only";

import { MYASSIST_CONTEXT_SOURCE_HEADER, type DailyContextSource } from "./dailyContextShared";
import { getMockDailyContext } from "./mockDailyContext";
import { assertSafeN8nWebhookUrl, type N8nIntegrationOverrides } from "./n8nWebhookUrl";
import { postJobHuntEmailSignals } from "./jobHuntEmailSignals";
import { getEmailTriageHints } from "./memoryStore";
import { isMyAssistDailyContext } from "./validateContext";
import type { MyAssistDailyContext } from "./types";

export type { DailyContextSource, N8nIntegrationOverrides };
export { MYASSIST_CONTEXT_SOURCE_HEADER };
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434").replace(/\/$/, "");
const EMAIL_IMPORTANCE_TIMEOUT_MS = 60000;

function shouldUseMock(url: string | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  if (trimmed !== "") return false;
  const force =
    process.env.MYASSIST_USE_MOCK_CONTEXT === "1" ||
    process.env.MYASSIST_USE_MOCK_CONTEXT === "true";
  if (force) return true;
  return process.env.NODE_ENV === "development";
}

function mergeWebhookUrl(overrides?: N8nIntegrationOverrides | null): string | undefined {
  const fromUser = overrides?.webhookUrl?.trim();
  if (fromUser) return fromUser;
  return process.env.MYASSIST_N8N_WEBHOOK_URL;
}

function mergeWebhookToken(overrides?: N8nIntegrationOverrides | null): string | undefined {
  const fromUser = overrides?.webhookToken?.trim();
  if (fromUser) return fromUser;
  return process.env.MYASSIST_N8N_WEBHOOK_TOKEN;
}

export async function fetchDailyContextFromN8n(
  overrides?: N8nIntegrationOverrides | null,
  userIdForEmailRanking?: string | null,
): Promise<{
  context: MyAssistDailyContext;
  source: DailyContextSource;
}> {
  const url = mergeWebhookUrl(overrides);
  if (shouldUseMock(url)) {
    return { context: getMockDailyContext(), source: "mock" };
  }

  const resolved = (url ?? "").trim();
  if (!resolved) {
    throw new Error(
      "MYASSIST_N8N_WEBHOOK_URL is not set. Add the n8n production webhook URL (Webhook - Fetch Daily Context), or set MYASSIST_USE_MOCK_CONTEXT=true for demo data.",
    );
  }

  await assertSafeN8nWebhookUrl(resolved, overrides);

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const token = mergeWebhookToken(overrides);
  if (token && token.trim() !== "") {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(resolved, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`n8n webhook request failed (${res.status}).`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("n8n webhook did not return valid JSON");
  }

  if (!isMyAssistDailyContext(parsed)) {
    throw new Error(
      "n8n response does not match MyAssist daily context shape (expected Normalize Aggregated Data output).",
    );
  }

  const flattened = flattenGmailSignals(parsed);
  const prioritized = await prioritizeContextEmails(flattened, userIdForEmailRanking ?? undefined);
  const job_hunt_email_matches = await postJobHuntEmailSignals(prioritized.gmail_signals);

  return {
    context: {
      ...prioritized,
      ...(job_hunt_email_matches.length > 0 ? { job_hunt_email_matches } : {}),
    },
    source: "n8n",
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
  if (process.env.MYASSIST_ENABLE_EMAIL_IMPORTANCE_AI === "0") return signals;
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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), EMAIL_IMPORTANCE_TIMEOUT_MS);
      const response = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          stream: false,
          format: "json",
          options: {
            temperature: 0.1,
            num_predict: 420,
          },
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
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const modelJson = (await response.json()) as { message?: { content?: string }; response?: string };
      const raw = modelJson.message?.content ?? modelJson.response ?? "";
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
      console.warn(`[MyAssist] Email ranking failed for model ${model}:`, e);
      continue;
    }
  }

  console.warn("[MyAssist] All email ranking models failed, returning original order");
  return signals;
}

function getEmailImportanceModels(): string[] {
  const fromEnv = process.env.OLLAMA_EMAIL_IMPORTANCE_MODELS?.trim();
  if (fromEnv) {
    return fromEnv
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean)
      .filter((model, index, array) => array.indexOf(model) === index);
  }
  return [
    process.env.OLLAMA_EMAIL_IMPORTANCE_MODEL?.trim() || "",
    "mistral:latest",
    "qwen2.5:1.5b",
    "qwen2.5:0.5b",
    process.env.OLLAMA_MODEL?.trim() || "",
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
