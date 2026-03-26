import "server-only";

import { markIntegrationRefreshUsed, getIntegrationToken, upsertIntegrationToken } from "@/lib/integrations/tokenStore";
import { refreshGoogleToken } from "@/lib/integrations/providers/google";
import type { AdapterTodayInput, LiveProviderAdapter } from "./types";

const GOOGLE_CALENDAR_BASE_URL = "https://www.googleapis.com/calendar/v3";

type GoogleCalendarEventDateTime = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type CalendarEvent = {
  id: string;
  summary: string;
  description: string;
  location: string | null;
  start: GoogleCalendarEventDateTime;
  end: GoogleCalendarEventDateTime;
  status: string | null;
};

export type CalendarCreatePayload = {
  summary: string;
  description?: string;
  location?: string;
  start: GoogleCalendarEventDateTime;
  end: GoogleCalendarEventDateTime;
};

export type CalendarUpdatePayload = Partial<CalendarCreatePayload> & {
  status?: "confirmed" | "tentative" | "cancelled";
};

async function withGoogleAccessToken(userId: string): Promise<string> {
  const token = await getIntegrationToken(userId, "google_calendar");
  if (!token?.access_token) throw new Error("calendar_not_connected");
  if (!token.expires_at || token.expires_at > Date.now() + 30_000) {
    return token.access_token;
  }
  if (!token.refresh_token) return token.access_token;
  const refreshed = await refreshGoogleToken(token.refresh_token);
  await upsertIntegrationToken(userId, "google_calendar", refreshed);
  await markIntegrationRefreshUsed(userId, "google_calendar");
  return refreshed.access_token ?? token.access_token;
}

function mapCalendarEvent(raw: Record<string, unknown>): CalendarEvent | null {
  const id = typeof raw.id === "string" ? raw.id : "";
  if (!id) return null;
  const start = (raw.start as GoogleCalendarEventDateTime | undefined) || {};
  const end = (raw.end as GoogleCalendarEventDateTime | undefined) || {};
  return {
    id,
    summary: typeof raw.summary === "string" ? raw.summary : "(untitled event)",
    description: typeof raw.description === "string" ? raw.description : "",
    location: typeof raw.location === "string" ? raw.location : null,
    start,
    end,
    status: typeof raw.status === "string" ? raw.status : null,
  };
}

async function fetchCalendarJson<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GOOGLE_CALENDAR_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`calendar_request_failed_${res.status}`);
  }
  return (await res.json()) as T;
}

export class CalendarAdapter
  implements LiveProviderAdapter<CalendarEvent, CalendarEvent, CalendarCreatePayload, CalendarUpdatePayload>
{
  constructor(private readonly userId: string, private readonly calendarId = "primary") {}

  async getToday(input?: AdapterTodayInput): Promise<CalendarEvent[]> {
    const accessToken = await withGoogleAccessToken(this.userId);
    const now = input?.now ?? new Date();
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(23, 59, 59, 999);
    const maxResults = String(Math.max(1, Math.min(input?.limit ?? 50, 250)));
    const qs = new URLSearchParams({
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: dayStart.toISOString(),
      timeMax: dayEnd.toISOString(),
      maxResults,
    });
    const response = await fetchCalendarJson<{ items?: Array<Record<string, unknown>> }>(
      accessToken,
      `/calendars/${encodeURIComponent(this.calendarId)}/events?${qs.toString()}`,
    );
    return (response.items || [])
      .map(mapCalendarEvent)
      .filter((event): event is CalendarEvent => Boolean(event));
  }

  async getById(id: string): Promise<CalendarEvent | null> {
    const eventId = id.trim();
    if (!eventId) return null;
    const accessToken = await withGoogleAccessToken(this.userId);
    const raw = await fetchCalendarJson<Record<string, unknown>>(
      accessToken,
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
    );
    return mapCalendarEvent(raw);
  }

  async search(query: string, limit = 25): Promise<CalendarEvent[]> {
    const q = query.trim();
    if (!q) return [];
    const accessToken = await withGoogleAccessToken(this.userId);
    const qs = new URLSearchParams({
      q,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(Math.max(1, Math.min(limit, 250))),
      timeMin: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    });
    const response = await fetchCalendarJson<{ items?: Array<Record<string, unknown>> }>(
      accessToken,
      `/calendars/${encodeURIComponent(this.calendarId)}/events?${qs.toString()}`,
    );
    return (response.items || [])
      .map(mapCalendarEvent)
      .filter((event): event is CalendarEvent => Boolean(event));
  }

  async create(payload: CalendarCreatePayload): Promise<CalendarEvent> {
    const accessToken = await withGoogleAccessToken(this.userId);
    const created = await fetchCalendarJson<Record<string, unknown>>(
      accessToken,
      `/calendars/${encodeURIComponent(this.calendarId)}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const event = mapCalendarEvent(created);
    if (!event) throw new Error("calendar_create_failed");
    return event;
  }

  async update(id: string, payload: CalendarUpdatePayload): Promise<CalendarEvent> {
    const eventId = id.trim();
    if (!eventId) throw new Error("calendar_invalid_event_id");
    const accessToken = await withGoogleAccessToken(this.userId);
    const updated = await fetchCalendarJson<Record<string, unknown>>(
      accessToken,
      `/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const event = mapCalendarEvent(updated);
    if (!event) throw new Error("calendar_update_failed");
    return event;
  }

  async archive(id: string): Promise<void> {
    const eventId = id.trim();
    if (!eventId) throw new Error("calendar_invalid_event_id");
    const accessToken = await withGoogleAccessToken(this.userId);
    const res = await fetch(
      `${GOOGLE_CALENDAR_BASE_URL}/calendars/${encodeURIComponent(this.calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      },
    );
    if (!res.ok) {
      throw new Error(`calendar_delete_failed_${res.status}`);
    }
  }
}

export function createCalendarAdapter(userId: string, calendarId?: string): CalendarAdapter {
  return new CalendarAdapter(userId, calendarId);
}
