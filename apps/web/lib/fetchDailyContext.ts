import { isMyAssistDailyContext } from "./validateContext";
import type { MyAssistDailyContext } from "./types";

export async function fetchDailyContextFromN8n(): Promise<MyAssistDailyContext> {
  const url = process.env.MYASSIST_N8N_WEBHOOK_URL;
  if (!url || url.trim() === "") {
    throw new Error(
      "MYASSIST_N8N_WEBHOOK_URL is not set. Add the n8n production webhook URL (Webhook - Fetch Daily Context).",
    );
  }

  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const token = process.env.MYASSIST_N8N_WEBHOOK_TOKEN;
  if (token && token.trim() !== "") {
    headers.Authorization = `Bearer ${token.trim()}`;
  }

  const res = await fetch(url, {
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

  return parsed;
}
