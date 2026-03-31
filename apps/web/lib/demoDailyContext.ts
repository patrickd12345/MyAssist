import type { GmailPhaseBSignal } from "./integrations/gmailSignalDetection";
import type { MyAssistDailyContext } from "./types";

function phase(mid: string, type: GmailPhaseBSignal["type"]): GmailPhaseBSignal {
  return { messageId: mid, type, confidence: 0.92, reason: "demo_seed" };
}

/**
 * Curated deterministic daily context for demos when `MYASSIST_DEMO_MODE=true`.
 * No live provider reads — believable job-search + calendar + tasks snapshot.
 */
export function getDemoDailyContext(): MyAssistDailyContext {
  const now = new Date();
  const runDate = now.toISOString().slice(0, 10);
  const iso = (h: number, m: number) =>
    `${runDate}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

  return {
    generated_at: now.toISOString(),
    run_date: runDate,
    todoist_overdue: [
      {
        id: "demo-todo-1",
        content: "Follow up on offer paperwork (Northwind)",
        priority: 4,
        due: { date: runDate },
      },
    ],
    todoist_due_today: [
      {
        id: "demo-todo-2",
        content: "Send thank-you after technical interview",
        priority: 3,
        due: { date: runDate },
      },
      {
        id: "demo-todo-3",
        content: "Review take-home scope email",
        priority: 2,
        due: { date: runDate },
      },
    ],
    todoist_upcoming_high_priority: [
      {
        id: "demo-todo-4",
        content: "Prep system design notes (60m)",
        priority: 4,
        due: { date: runDate },
      },
    ],
    gmail_signals: [
      {
        id: "demo-g1",
        threadId: "demo-th1",
        from: "Northwind Talent <offers@northwind.example.com>",
        subject: "Offer package — please confirm by Friday",
        snippet:
          "We are pleased to extend an offer. Please review the attached terms and confirm acceptance by end of week so we can proceed with onboarding.",
        date: now.toISOString(),
        phase_b_signals: [phase("demo-g1", "job_offer"), phase("demo-g1", "action_required"), phase("demo-g1", "important")],
      },
      {
        id: "demo-g2",
        threadId: "demo-th2",
        from: "Alex Rivera <alex@contoso-recruiting.example.com>",
        subject: "Technical interview — schedule your panel",
        snippet:
          "We would like to schedule a 90-minute technical interview with the platform team. Please reply with two slots that work this week.",
        date: now.toISOString(),
        phase_b_signals: [
          phase("demo-g2", "job_interview"),
          phase("demo-g2", "action_required"),
          phase("demo-g2", "job_recruiter"),
        ],
      },
    ],
    calendar_today: [
      {
        id: "demo-cal-1",
        summary: "Team standup",
        title: "Team standup",
        start: iso(14, 0),
        end: iso(14, 25),
        location: "Zoom",
        source: "google_calendar",
        meetingLinkPresent: true,
      },
      {
        id: "demo-cal-2",
        summary: "Technical interview — Northwind (platform)",
        title: "Technical interview — Northwind (platform)",
        start: iso(17, 0),
        end: iso(18, 30),
        location: "Zoom · breakout room B",
        source: "google_calendar",
        meetingLinkPresent: true,
      },
      {
        id: "demo-cal-3",
        summary: "1:1 with manager",
        title: "1:1 with manager",
        start: iso(19, 30),
        end: iso(20, 0),
        location: null,
        source: "google_calendar",
        meetingLinkPresent: false,
      },
    ],
  };
}
