import type { MyAssistDailyContext } from "./types";
import { analyzeEmail } from "./services/jobHuntIntelligenceService";

/** Minimal valid payload for UI dev when n8n webhook URL is not configured. */
export function getMockDailyContext(): MyAssistDailyContext {
  const now = new Date();
  const runDate = now.toISOString().slice(0, 10);
  const interviewSignal = {
    id: "mock-g2",
    threadId: "t2",
    from: "talent@example.com",
    subject: "Next step: schedule your technical interview",
    snippet:
      "We would like to schedule an interview for the software engineer role. Please book a time that works for you.",
    date: now.toISOString(),
  };
  return {
    generated_at: now.toISOString(),
    run_date: runDate,
    todoist_overdue: [
      { id: "mock-1", content: "Example overdue task (mock)", priority: 4 },
    ],
    todoist_due_today: [
      { id: "mock-2", content: "Example due today (mock)", priority: 3 },
    ],
    todoist_upcoming_high_priority: [
      { id: "mock-3", content: "Example upcoming (mock)", priority: 4 },
    ],
    gmail_signals: [
      {
        id: "mock-g1",
        threadId: "t1",
        from: "notifications@example.com",
        subject: "Example signal (mock)",
        snippet: "Set MYASSIST_N8N_WEBHOOK_URL for live Gmail signals.",
        date: now.toISOString(),
      },
      {
        ...interviewSignal,
        job_hunt_analysis: analyzeEmail(interviewSignal),
      },
    ],
    calendar_today: [
      {
        id: "mock-cal1",
        summary: "Example event (mock)",
        start: now.toISOString(),
        end: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
        location: null,
      },
    ],
  };
}
