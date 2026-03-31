import type { CalendarEvent, CalendarIntelligence, CalendarSignal } from "./types";
import { isInterviewLikeCalendarEvent } from "./services/todayIntelligenceService";

const FOCUS_KW = /\b(focus|deep work|heads?\s*down|do not disturb|\bdnd\b)\b/i;

const TRAVEL_BUFFER_MIN_MS = 15 * 60 * 1000;

const BUSY_MEETING_COUNT = 6;

const BUSY_BLOCK_MS = 6 * 60 * 60 * 1000;

function isTimedStart(start: string | null): boolean {
  return Boolean(start && start.includes("T"));
}

function timedBounds(ev: CalendarEvent): { startMs: number; endMs: number } | null {
  if (!ev.start || !isTimedStart(ev.start)) return null;
  const startMs = Date.parse(ev.start);
  if (Number.isNaN(startMs)) return null;
  let endMs: number;
  if (ev.end && isTimedStart(ev.end)) {
    endMs = Date.parse(ev.end);
    if (Number.isNaN(endMs)) endMs = startMs + 60 * 60 * 1000;
  } else {
    endMs = startMs + 60 * 60 * 1000;
  }
  if (endMs <= startMs) endMs = startMs + 15 * 60 * 1000;
  return { startMs, endMs };
}

function utcDayKey(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function eventDayKeyUtc(ev: CalendarEvent): string | null {
  if (!ev.start) return null;
  if (isTimedStart(ev.start)) return utcDayKey(ev.start);
  return ev.start.length >= 10 ? ev.start.slice(0, 10) : null;
}

function overlaps(
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number },
): boolean {
  return a.startMs < b.endMs && b.startMs < a.endMs;
}

/**
 * Deterministic calendar intelligence for a bounded event list (read-only, no LLM).
 */
export function buildCalendarIntelligence(
  events: CalendarEvent[],
  nowMs: number = Date.now(),
  runDateUtc: string = new Date(nowMs).toISOString().slice(0, 10),
): CalendarIntelligence {
  const sorted = [...events].sort((a, b) => {
    const as = a.start ? Date.parse(a.start.includes("T") ? a.start : `${a.start}T00:00:00.000Z`) : 0;
    const bs = b.start ? Date.parse(b.start.includes("T") ? b.start : `${b.start}T00:00:00.000Z`) : 0;
    return (Number.isNaN(as) ? 0 : as) - (Number.isNaN(bs) ? 0 : bs);
  });

  const signals: CalendarSignal[] = [];

  if (sorted.length === 0) {
    return {
      signals: [],
      summary: "No calendar events in the current window.",
      counts: {
        eventsInWindow: 0,
        timedEventsInWindow: 0,
        minutesUntilNextMeeting: null,
      },
    };
  }

  const timedWithBounds = sorted
    .map((ev) => ({ ev, bounds: timedBounds(ev) }))
    .filter((x): x is { ev: CalendarEvent; bounds: { startMs: number; endMs: number } } => x.bounds !== null);

  let minutesUntilNextMeeting: number | null = null;
  for (const { bounds } of timedWithBounds) {
    if (bounds.startMs >= nowMs) {
      minutesUntilNextMeeting = Math.round((bounds.startMs - nowMs) / 60_000);
      break;
    }
  }

  if (minutesUntilNextMeeting !== null) {
    signals.push({ type: "next_meeting", detail: `Next timed event in ${minutesUntilNextMeeting} min.` });
  }

  const meetingToday = sorted.some((ev) => eventDayKeyUtc(ev) === runDateUtc);
  if (meetingToday) {
    signals.push({ type: "meeting_today", detail: "At least one event on today's date (UTC)." });
  }

  const interviewLike = sorted.filter((ev) => isInterviewLikeCalendarEvent(ev));
  if (interviewLike.length > 0) {
    signals.push({
      type: "interview_like_event",
      detail: `${interviewLike.length} event(s) match interview-like titles.`,
      eventIds: interviewLike
        .map((e) => e.id)
        .filter((x): x is string => typeof x === "string" && x.length > 0)
        .slice(0, 5),
    });
  }

  conflict: for (let i = 0; i < timedWithBounds.length; i++) {
    for (let j = i + 1; j < timedWithBounds.length; j++) {
      const ai = timedWithBounds[i]!.bounds;
      const bi = timedWithBounds[j]!.bounds;
      if (overlaps(ai, bi)) {
        signals.push({
          type: "scheduling_conflict",
          detail: "Overlapping timed events in the window.",
          eventIds: [timedWithBounds[i]!.ev.id, timedWithBounds[j]!.ev.id].filter(
            (x): x is string => typeof x === "string" && x.length > 0,
          ),
        });
        break conflict;
      }
    }
  }

  for (const ev of sorted) {
    if (FOCUS_KW.test(ev.summary || "")) {
      signals.push({
        type: "focus_block",
        detail: ev.summary,
        eventIds: ev.id ? [ev.id] : undefined,
      });
      break;
    }
  }

  const byDay = new Map<string, { count: number; durationMs: number }>();
  for (const { bounds } of timedWithBounds) {
    const day = utcDayKey(new Date(bounds.startMs).toISOString());
    if (!day) continue;
    const row = byDay.get(day) ?? { count: 0, durationMs: 0 };
    row.count += 1;
    row.durationMs += bounds.endMs - bounds.startMs;
    byDay.set(day, row);
  }

  for (const [day, agg] of byDay) {
    if (agg.count >= BUSY_MEETING_COUNT || agg.durationMs >= BUSY_BLOCK_MS) {
      signals.push({
        type: "calendar_busy_day",
        detail: `${day}: ${agg.count} timed blocks, ${Math.round(agg.durationMs / 60000)} min booked.`,
      });
      break;
    }
  }

  const orderedTimed = timedWithBounds
    .map((x) => ({ ...x, bounds: x.bounds }))
    .sort((a, b) => a.bounds.startMs - b.bounds.startMs);

  for (let i = 0; i < orderedTimed.length - 1; i++) {
    const a = orderedTimed[i]!;
    const b = orderedTimed[i + 1]!;
    const gap = b.bounds.startMs - a.bounds.endMs;
    const locA = (a.ev.location || "").trim();
    const locB = (b.ev.location || "").trim();
    if (locA && locB && locA !== locB && gap >= 0 && gap < TRAVEL_BUFFER_MIN_MS) {
      signals.push({
        type: "travel_buffer_needed",
        detail: "Back-to-back timed events with different locations and under 15 min gap.",
        eventIds: [a.ev.id, b.ev.id].filter((x): x is string => typeof x === "string" && x.length > 0),
      });
      break;
    }
  }

  const summaryParts: string[] = [];
  summaryParts.push(`${sorted.length} event(s) in window.`);
  if (minutesUntilNextMeeting !== null) {
    summaryParts.push(`Next meeting in ~${minutesUntilNextMeeting} min.`);
  }
  if (meetingToday) summaryParts.push("Something runs today.");
  const conflict = signals.some((s) => s.type === "scheduling_conflict");
  if (conflict) summaryParts.push("Overlaps detected.");
  const travel = signals.some((s) => s.type === "travel_buffer_needed");
  if (travel) summaryParts.push("Tight travel between locations.");

  return {
    signals,
    summary: summaryParts.join(" "),
    counts: {
      eventsInWindow: sorted.length,
      timedEventsInWindow: timedWithBounds.length,
      minutesUntilNextMeeting,
    },
  };
}
