import type { MyAssistDailyContext } from "./types";

/** Minimal valid payload for UI dev when n8n webhook URL is not configured. */
export function getMockDailyContext(): MyAssistDailyContext {
  const now = new Date();
  const runDate = now.toISOString().slice(0, 10);
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
