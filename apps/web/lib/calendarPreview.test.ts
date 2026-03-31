import { describe, expect, it } from "vitest";
import { mapGoogleCalendarEventRecord } from "./calendarPreview";

describe("mapGoogleCalendarEventRecord", () => {
  it("maps timed event with organizer and meeting link", () => {
    const raw = {
      id: "ev1",
      summary: "Standup",
      start: { dateTime: "2026-03-25T14:00:00.000Z", timeZone: "UTC" },
      end: { dateTime: "2026-03-25T14:15:00.000Z" },
      location: "HQ",
      status: "confirmed",
      hangoutLink: "https://meet.google.com/abc-defg-hij",
      organizer: { email: "org@example.com", displayName: "Org" },
      attendees: [{}, {}],
    };
    const ev = mapGoogleCalendarEventRecord(raw);
    expect(ev.id).toBe("ev1");
    expect(ev.summary).toBe("Standup");
    expect(ev.title).toBe("Standup");
    expect(ev.allDay).toBe(false);
    expect(ev.start).toBe("2026-03-25T14:00:00.000Z");
    expect(ev.status).toBe("confirmed");
    expect(ev.organizer).toContain("org@example.com");
    expect(ev.attendeesCount).toBe(2);
    expect(ev.meetingLinkPresent).toBe(true);
    expect(ev.source).toBe("google_calendar");
  });

  it("maps all-day event", () => {
    const raw = {
      id: "ev2",
      summary: "Holiday",
      start: { date: "2026-03-26" },
      end: { date: "2026-03-27" },
    };
    const ev = mapGoogleCalendarEventRecord(raw);
    expect(ev.allDay).toBe(true);
    expect(ev.start).toBe("2026-03-26");
    expect(ev.meetingLinkPresent).toBe(false);
  });
});
