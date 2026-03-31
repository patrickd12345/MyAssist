import type { CalendarEvent } from "./types";

/** Default: today through the next 6 calendar days (7 days total). */
export const CALENDAR_INTELLIGENCE_WINDOW_DAYS = 7;

/** Per-calendar cap before merge; total capped after merge in integration service. */
export const CALENDAR_FETCH_MAX_PER_CALENDAR = 25;

/** Hard cap on merged events across calendars. */
export const CALENDAR_FETCH_MAX_TOTAL = 80;

function organizerLabel(raw: Record<string, unknown>): string | null {
  const org = raw.organizer as Record<string, unknown> | undefined;
  if (!org) return null;
  const email = typeof org.email === "string" ? org.email.trim() : "";
  const display = typeof org.displayName === "string" ? org.displayName.trim() : "";
  if (display && email) return `${display} <${email}>`;
  return email || display || null;
}

function attendeesCount(raw: Record<string, unknown>): number | undefined {
  const att = raw.attendees;
  if (!Array.isArray(att)) return undefined;
  return att.length;
}

function meetingLinkPresent(raw: Record<string, unknown>): boolean {
  if (typeof raw.hangoutLink === "string" && raw.hangoutLink.length > 0) return true;
  const conf = raw.conferenceData as Record<string, unknown> | undefined;
  const entryPoints = conf?.entryPoints;
  if (Array.isArray(entryPoints)) {
    return entryPoints.some(
      (e) =>
        e &&
        typeof (e as Record<string, unknown>).uri === "string" &&
        (e as Record<string, unknown>).uri !== "",
    );
  }
  const loc = typeof raw.location === "string" ? raw.location : "";
  return /\b(zoom\.us|teams\.microsoft|meet\.google|webex\.com)\b/i.test(loc);
}

/**
 * Maps a Google Calendar API event resource to the canonical MyAssist `CalendarEvent` shape.
 */
export function mapGoogleCalendarEventRecord(e: Record<string, unknown>): CalendarEvent {
  const startObj = (e.start as Record<string, unknown> | undefined) || {};
  const endObj = (e.end as Record<string, unknown> | undefined) || {};
  const hasDateTime = typeof startObj.dateTime === "string";
  const hasDateOnly = typeof startObj.date === "string" && !hasDateTime;

  const summaryRaw = typeof e.summary === "string" ? e.summary : "(untitled event)";
  const start =
    (typeof startObj.dateTime === "string" && startObj.dateTime) ||
    (typeof startObj.date === "string" && startObj.date) ||
    null;
  const end =
    (typeof endObj.dateTime === "string" && endObj.dateTime) ||
    (typeof endObj.date === "string" && endObj.date) ||
    null;

  return {
    id: typeof e.id === "string" ? e.id : null,
    summary: summaryRaw,
    title: summaryRaw,
    start,
    end,
    location: typeof e.location === "string" ? e.location : null,
    allDay: hasDateOnly,
    attendeesCount: attendeesCount(e),
    status: typeof e.status === "string" ? e.status : null,
    organizer: organizerLabel(e),
    meetingLinkPresent: meetingLinkPresent(e),
    source: "google_calendar",
  };
}

export function mapGoogleCalendarEventsRaw(raw: Array<Record<string, unknown>>): CalendarEvent[] {
  return raw.map((e) => mapGoogleCalendarEventRecord(e));
}
