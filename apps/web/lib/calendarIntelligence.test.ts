import { describe, expect, it } from "vitest";
import { buildCalendarIntelligence } from "./calendarIntelligence";
import type { CalendarEvent } from "./types";

const base = (overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: "e1",
  summary: "Meeting",
  start: "2026-03-25T15:00:00.000Z",
  end: "2026-03-25T16:00:00.000Z",
  location: null,
  ...overrides,
});

describe("buildCalendarIntelligence", () => {
  const runDate = "2026-03-25";
  const nowMs = new Date("2026-03-25T10:00:00.000Z").getTime();

  it("handles empty calendar", () => {
    const out = buildCalendarIntelligence([], nowMs, runDate);
    expect(out.signals).toHaveLength(0);
    expect(out.summary).toMatch(/No calendar events/);
    expect(out.counts.eventsInWindow).toBe(0);
    expect(out.counts.minutesUntilNextMeeting).toBeNull();
  });

  it("flags next upcoming timed meeting", () => {
    const out = buildCalendarIntelligence(
      [base({ id: "a", start: "2026-03-25T11:00:00.000Z", end: "2026-03-25T12:00:00.000Z" })],
      nowMs,
      runDate,
    );
    expect(out.counts.minutesUntilNextMeeting).toBe(60);
    expect(out.signals.some((s) => s.type === "next_meeting")).toBe(true);
  });

  it("flags meeting_today for events on run date (UTC)", () => {
    const out = buildCalendarIntelligence(
      [base({ start: "2026-03-25T14:00:00.000Z" })],
      nowMs,
      runDate,
    );
    expect(out.signals.some((s) => s.type === "meeting_today")).toBe(true);
  });

  it("flags interview_like_event from title", () => {
    const out = buildCalendarIntelligence(
      [base({ summary: "Technical interview with Acme", id: "int1" })],
      nowMs,
      runDate,
    );
    expect(out.signals.some((s) => s.type === "interview_like_event")).toBe(true);
  });

  it("detects scheduling_conflict for overlapping timed events", () => {
    const out = buildCalendarIntelligence(
      [
        base({ id: "a", start: "2026-03-25T12:00:00.000Z", end: "2026-03-25T13:30:00.000Z" }),
        base({ id: "b", start: "2026-03-25T12:30:00.000Z", end: "2026-03-25T14:00:00.000Z" }),
      ],
      nowMs,
      runDate,
    );
    expect(out.signals.some((s) => s.type === "scheduling_conflict")).toBe(true);
  });

  it("detects travel_buffer_needed for tight gap and different locations", () => {
    const out = buildCalendarIntelligence(
      [
        base({
          id: "a",
          start: "2026-03-25T12:00:00.000Z",
          end: "2026-03-25T12:45:00.000Z",
          location: "Office A",
        }),
        base({
          id: "b",
          start: "2026-03-25T12:50:00.000Z",
          end: "2026-03-25T13:30:00.000Z",
          location: "Office B",
        }),
      ],
      nowMs,
      runDate,
    );
    expect(out.signals.some((s) => s.type === "travel_buffer_needed")).toBe(true);
  });

  it("flags calendar_busy_day when many timed blocks land on one day", () => {
    const day: CalendarEvent[] = [];
    for (let i = 0; i < 6; i++) {
      day.push(
        base({
          id: `d-${i}`,
          summary: `Block ${i}`,
          start: `2026-03-26T${String(9 + i).padStart(2, "0")}:00:00.000Z`,
          end: `2026-03-26T${String(9 + i).padStart(2, "0")}:45:00.000Z`,
        }),
      );
    }
    const out = buildCalendarIntelligence(day, new Date("2026-03-26T08:00:00.000Z").getTime(), "2026-03-26");
    expect(out.signals.some((s) => s.type === "calendar_busy_day")).toBe(true);
  });

  it("detects focus_block keyword in title", () => {
    const out = buildCalendarIntelligence(
      [base({ summary: "Deep work — focus block", id: "f1" })],
      nowMs,
      runDate,
    );
    expect(out.signals.some((s) => s.type === "focus_block")).toBe(true);
  });
});
