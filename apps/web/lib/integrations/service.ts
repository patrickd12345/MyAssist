import "server-only";

import { getIntegrationToken, listIntegrationStatuses, markIntegrationRefreshUsed, revokeIntegration, upsertIntegrationToken } from "./tokenStore";
import { exchangeGoogleCode, refreshGoogleToken } from "./providers/google";
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
  const refreshed = await refreshGoogleToken(token.refresh_token);
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
    const token = await exchangeGoogleCode({ code: input.code, redirectUri: input.redirectUri });
    await upsertProviderToken(input.userId, input.provider, token);
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
    if (!res.ok) return { ok: false as const, reason: `gmail-${res.status}` };
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
    if (!res.ok) return { ok: false as const, reason: `gmail-${res.status}` };
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
    const token = await withGoogleToken(userId, "gmail");
    if (!token) return null;
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox newer_than:10d&maxResults=20",
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    if (!listRes.ok) return null;
    const list = (await listRes.json()) as { messages?: Array<{ id: string; threadId?: string }> };
    const out: Array<Record<string, unknown>> = [];
    for (const m of list.messages || []) {
      const detailsRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          m.id,
        )}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (!detailsRes.ok) continue;
      const msg = (await detailsRes.json()) as {
        id?: string;
        threadId?: string;
        snippet?: string;
        labelIds?: string[];
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      const headers = msg.payload?.headers || [];
      const header = (name: string) =>
        headers.find((h) => (h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
      const labelIds = Array.isArray(msg.labelIds) ? msg.labelIds.filter((x): x is string => typeof x === "string") : [];
      out.push({
        id: msg.id || m.id,
        threadId: msg.threadId || m.threadId,
        from: header("From"),
        subject: header("Subject"),
        date: header("Date"),
        snippet: msg.snippet || "",
        label_ids: labelIds,
      });
    }
    return out;
  },

  async fetchCalendarEvents(userId: string) {
    const token = await withGoogleToken(userId, "google_calendar");
    if (!token) return null;
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const qs = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      maxResults: "50",
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

    return deduped.slice(0, 50);
  },
};
