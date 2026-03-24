import { getMockDailyContext } from "./mockDailyContext";
import { isMyAssistDailyContext } from "./validateContext";
import type { MyAssistDailyContext } from "./types";

export type DailyContextSource = "n8n" | "mock";

/** Response header on `/api/daily-context`: `n8n` or `mock` (body stays pure JSON for Custom GPT). */
export const MYASSIST_CONTEXT_SOURCE_HEADER = "x-myassist-context-source";

function shouldUseMock(url: string | undefined): boolean {
  const trimmed = url?.trim() ?? "";
  if (trimmed !== "") return false;
  const force =
    process.env.MYASSIST_USE_MOCK_CONTEXT === "1" ||
    process.env.MYASSIST_USE_MOCK_CONTEXT === "true";
  if (force) return true;
  return process.env.NODE_ENV === "development";
}

export async function fetchDailyContextFromN8n(): Promise<{
  context: MyAssistDailyContext;
  source: DailyContextSource;
}> {
  const url = process.env.MYASSIST_N8N_WEBHOOK_URL;
  if (shouldUseMock(url)) {
    return { context: getMockDailyContext(), source: "mock" };
  }

  const resolved = (url ?? "").trim();
  if (!resolved) {
    throw new Error(
      "MYASSIST_N8N_WEBHOOK_URL is not set. Add the n8n production webhook URL (Webhook - Fetch Daily Context), or set MYASSIST_USE_MOCK_CONTEXT=true for demo data.",
    );
  }

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const token = process.env.MYASSIST_N8N_WEBHOOK_TOKEN;
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
    throw new Error(`n8n webhook returned ${res.status}: ${text.slice(0, 500)}`);
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

  return { context: flattened, source: "n8n" };
}

function flattenGmailSignals(context: MyAssistDailyContext): MyAssistDailyContext {
  const normalized: MyAssistDailyContext = {
    ...context,
    gmail_signals: context.gmail_signals.map((signal) => ({
      ...signal,
      from: flattenText(signal.from),
      subject: flattenText(signal.subject),
      snippet: flattenText(signal.snippet),
    })),
  };
  return normalized;
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
