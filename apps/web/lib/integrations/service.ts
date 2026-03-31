import "server-only";

import { getIntegrationToken, listIntegrationStatuses, markIntegrationRefreshUsed, revokeIntegration, upsertIntegrationToken } from "./tokenStore";
import {
  exchangeGoogleCode,
  fetchGoogleOAuthUserInfo,
  mergeGoogleTokenPayload,
  refreshGoogleToken,
} from "./providers/google";
import {
  fetchGmailInboxPage,
  GMAIL_SIGNALS_DEFAULT_QUERY,
  GMAIL_SIGNALS_FETCH_MAX_RESULTS,
} from "./gmailInboxFetch";
import {
  dedupeNormalizedGmailMessages,
  normalizeGmailInboxPreview,
  normalizedToLegacySignalRecord,
} from "./gmailNormalize";
import { detectSignals, type GmailPhaseBSignal } from "./gmailSignalDetection";
import {
  CALENDAR_FETCH_MAX_PER_CALENDAR,
  CALENDAR_FETCH_MAX_TOTAL,
  CALENDAR_INTELLIGENCE_WINDOW_DAYS,
} from "../calendarPreview";
import type { IntegrationProvider, IntegrationTokenPayload } from "./types";

async function withGoogleToken(
  userId: string,
  provider: "gmail" | "google_calendar",
): Promise<string | null> {
  const token = await getIntegrationToken(userId, provider);
  if (!token?.access_token) return null;
  if (!token.expires_at || token.expires_at > Date.now() + 30_000) {
    return token.access_token;
  }
  if (!token.refresh_token) return token.access_token;
  const refreshed = await refreshGoogleToken(token.refresh_token, token);
  await upsertIntegrationToken(userId, provider, refreshed);
  await markIntegrationRefreshUsed(userId, provider);
  return refreshed.access_token ?? token.access_token;
}

async function upsertProviderToken(
  userId: string,
  provider: IntegrationProvider,
  token: IntegrationTokenPayload,
): Promise<void> {
  await upsertIntegrationToken(userId, provider, token);
}

export const integrationService = {
  async getStatuses(userId: string) {
    return listIntegrationStatuses(userId);
  },

  async storeToken(userId: string, provider: IntegrationProvider, token: IntegrationTokenPayload) {
    await upsertProviderToken(userId, provider, token);
  },

  async disconnect(userId: string, provider: IntegrationProvider) {
    await revokeIntegration(userId, provider);
  },

  async exchangeGoogleAndStore(input: {
    userId: string;
    provider: "gmail" | "google_calendar";
    code: string;
    redirectUri: string;
  }) {
    const incoming = await exchangeGoogleCode({ code: input.code, redirectUri: input.redirectUri });
    const existing = await getIntegrationToken(input.userId, input.provider);
    let merged = mergeGoogleTokenPayload(existing, incoming);
    if (merged.access_token) {
      const profile = await fetchGoogleOAuthUserInfo(merged.access_token);
      if (profile?.sub || profile?.email) {
        merged = mergeGoogleTokenPayload(merged, {
          provider_account_id: profile.sub,
          provider_account_email: profile.email,
        });
      }
    }
    await upsertProviderToken(input.userId, input.provider, merged);
  },

  /**
   * Minimal Gmail API check: lists up to 3 message ids (read-only). For developer verification after OAuth.
   */
  async verifyGmailConnection(userId: string) {
    const access = await withGoogleToken(userId, "gmail");
    if (!access) return { ok: false as const, reason: "disconnected" as const };
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=3",
      { headers: { Authorization: `Bearer ${access}` }, cache: "no-store" },
    );
    if (!listRes.ok) {
      if (listRes.status === 403) return { ok: false as const, reason: "insufficient_scope" as const };
      return { ok: false as const, reason: `gmail-${listRes.status}` as const };
    }
    const list = (await listRes.json()) as { messages?: Array<{ id?: string }> };
    const messageIds = (list.messages || []).map((m) => m.id).filter((id): id is string => Boolean(id));
    const stored = await getIntegrationToken(userId, "gmail");
    return {
      ok: true as const,
      messageIds,
      profile:
        stored?.provider_account_id || stored?.provider_account_email
          ? { sub: stored.provider_account_id, email: stored.provider_account_email }
          : undefined,
      scopes:
        typeof stored?.scope === "string" ? stored.scope.split(/\s+/).filter(Boolean) : undefined,
    };
  },

  async markEmailRead(userId: string, input: { messageId?: string; threadId?: string }) {
    const token = await withGoogleToken(userId, "gmail");
    if (!token) return { ok: false as const, reason: "disconnected" };
    const ids: string[] = [];
    if (input.messageId?.trim()) ids.push(input.messageId.trim());
    if (ids.length === 0 && input.threadId?.trim()) {
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
          input.threadId.trim(),
        )}?format=metadata`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (listRes.ok) {
        const thread = (await listRes.json()) as { messages?: Array<{ id?: string }> };
        for (const m of thread.messages || []) {
          if (m.id?.trim()) ids.push(m.id.trim());
        }
      }
    }
    if (ids.length === 0) return { ok: false as const, reason: "missing-id" };
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids, removeLabelIds: ["UNREAD"] }),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 403) return { ok: false as const, reason: "insufficient_scope" };
      return { ok: false as const, reason: `gmail-${res.status}` };
    }
    return { ok: true as const };
  },

  async markEmailUnread(userId: string, input: { messageId?: string; threadId?: string }) {
    const token = await withGoogleToken(userId, "gmail");
    if (!token) return { ok: false as const, reason: "disconnected" };
    const ids: string[] = [];
    if (input.messageId?.trim()) ids.push(input.messageId.trim());
    if (ids.length === 0 && input.threadId?.trim()) {
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(
          input.threadId.trim(),
        )}?format=metadata`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (listRes.ok) {
        const thread = (await listRes.json()) as { messages?: Array<{ id?: string }> };
        for (const m of thread.messages || []) {
          if (m.id?.trim()) ids.push(m.id.trim());
        }
      }
    }
    if (ids.length === 0) return { ok: false as const, reason: "missing-id" };
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ids, addLabelIds: ["UNREAD"] }),
      cache: "no-store",
    });
    if (!res.ok) {
      if (res.status === 403) return { ok: false as const, reason: "insufficient_scope" };
      return { ok: false as const, reason: `gmail-${res.status}` };
    }
    return { ok: true as const };
  },

  async completeTodoistTask(userId: string, taskId: string) {
    const token = await getIntegrationToken(userId, "todoist");
    const access = token?.access_token;
    if (!access) return { ok: false as const, reason: "disconnected" };
    const res = await fetch(
      `https://api.todoist.com/api/v1/tasks/${encodeURIComponent(taskId)}/close`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access}` },
        cache: "no-store",
      },
    );
    if (!res.ok) return { ok: false as const, reason: `todoist-${res.status}` };
    return { ok: true as const };
  },

  async rescheduleTodoistTask(userId: string, input: { taskId: string; dueString: string; dueLang?: string }) {
    const token = await getIntegrationToken(userId, "todoist");
    const access = token?.access_token;
    if (!access) return { ok: false as const, reason: "disconnected" };
    const res = await fetch(`https://api.todoist.com/api/v1/tasks/${encodeURIComponent(input.taskId)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        due_string: input.dueString,
        due_lang: input.dueLang || "en",
      }),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false as const, reason: `todoist-${res.status}` };
    const payload = await res.json();
    return { ok: true as const, payload };
  },

  async fetchGmailSignals(userId: string) {
    const access = await withGoogleToken(userId, "gmail");
    if (!access) return null;
    const stored = await getIntegrationToken(userId, "gmail");
    const result = await fetchGmailInboxPage(access, {
      maxResults: GMAIL_SIGNALS_FETCH_MAX_RESULTS,
      q: GMAIL_SIGNALS_DEFAULT_QUERY,
    });
    if (!result.ok) return null;
    const normalizedAt = new Date().toISOString();
    const normalized = result.messages.map((p) =>
      normalizeGmailInboxPreview(p, {
        providerAccountId: stored?.provider_account_id ?? null,
        normalizedAt,
      }),
    );
    const deduped = dedupeNormalizedGmailMessages(normalized);
    const allSignals = detectSignals(deduped);
    const byMessage = new Map<string, GmailPhaseBSignal[]>();
    for (const s of allSignals) {
      const list = byMessage.get(s.messageId) ?? [];
      list.push(s);
      byMessage.set(s.messageId, list);
    }
    return deduped.map((n) => {
      const legacy = normalizedToLegacySignalRecord(n);
      const phase_b_signals = byMessage.get(n.messageId) ?? [];
      return phase_b_signals.length > 0 ? { ...legacy, phase_b_signals } : legacy;
    });
  },

  /**
   * Bounded inbox page (read-only). Uses shared list + metadata path; returns nextPageToken when Gmail provides it.
   */
  async fetchGmailInboxPageForUser(
    userId: string,
    input: { maxResults?: number; pageToken?: string; q?: string },
  ) {
    const token = await withGoogleToken(userId, "gmail");
    if (!token) return null;
    return fetchGmailInboxPage(token, {
      maxResults: input.maxResults,
      pageToken: input.pageToken,
      q: input.q,
      defaultQuery: GMAIL_SIGNALS_DEFAULT_QUERY,
    });
  },

  async fetchCalendarEvents(userId: string) {
    const token = await withGoogleToken(userId, "google_calendar");
    if (!token) return null;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + (CALENDAR_INTELLIGENCE_WINDOW_DAYS - 1));
    dayEnd.setHours(23, 59, 59, 999);
    const qs = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      maxResults: String(CALENDAR_FETCH_MAX_PER_CALENDAR),
    });
    const headers = { Authorization: `Bearer ${token}` };

    const calendarListRes = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader&showHidden=false",
      { headers, cache: "no-store" },
    );
    if (!calendarListRes.ok) return null;

    const calendarList = (await calendarListRes.json()) as {
      items?: Array<{ id?: string; selected?: boolean; primary?: boolean }>;
    };
    const calendarIds = (calendarList.items || [])
      .filter((c) => c?.id && (c.selected || c.primary))
      .map((c) => c.id as string);
    if (calendarIds.length === 0) {
      calendarIds.push("primary");
    }

    const perCalendar = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
          { headers, cache: "no-store" },
        );
        if (!res.ok) return [];
        const json = (await res.json()) as { items?: Array<Record<string, unknown>> };
        return json.items || [];
      }),
    );

    const out = perCalendar.flat();
    const seen = new Set<string>();
    const deduped = out.filter((event) => {
      const start = (event.start as { dateTime?: string; date?: string } | undefined)?.dateTime
        || (event.start as { dateTime?: string; date?: string } | undefined)?.date
        || "";
      const key = `${String(event.id ?? "")}|${start}|${String(event.summary ?? "")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    deduped.sort((a, b) => {
      const aStart =
        (a.start as { dateTime?: string; date?: string } | undefined)?.dateTime
        || (a.start as { dateTime?: string; date?: string } | undefined)?.date
        || "";
      const bStart =
        (b.start as { dateTime?: string; date?: string } | undefined)?.dateTime
        || (b.start as { dateTime?: string; date?: string } | undefined)?.date
        || "";
      const aTime = Date.parse(aStart);
      const bTime = Date.parse(bStart);
      return (Number.isNaN(aTime) ? Number.POSITIVE_INFINITY : aTime)
        - (Number.isNaN(bTime) ? Number.POSITIVE_INFINITY : bTime);
    });

    return deduped.slice(0, CALENDAR_FETCH_MAX_TOTAL);
  },
};
