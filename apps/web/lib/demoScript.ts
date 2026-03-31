export type DemoWalkthroughStep = {
  title: string;
  description: string;
};

export type DemoWalkthrough = {
  title: string;
  description: string;
  steps: DemoWalkthroughStep[];
  /** Short lines for a live presenter or slide notes. */
  talkingPoints: string[];
};

/**
 * Deterministic demo narrative for use with `MYASSIST_DEMO_MODE` (see `getDemoDailyContext`).
 */
export function getDemoWalkthrough(): DemoWalkthrough {
  return {
    title: "MyAssist Demo Walkthrough",
    description:
      "Use with MYASSIST_DEMO_MODE=true. Walks the Today surface from greeting through assistant context.",
    steps: [
      {
        title: "Good morning message",
        description:
          "Executive-style line from unified briefing counts — deterministic, optional AI polish when MYASSIST_DAILY_INTEL_AI is on.",
      },
      {
        title: "Unified briefing",
        description:
          "Single summary plus focus lines: urgent items, schedule, tasks, and email signals combined.",
      },
      {
        title: "Inbox intelligence",
        description: "Phase-B buckets (urgent, job, action) and priorities from Gmail signals in context.",
      },
      {
        title: "Calendar intelligence",
        description: "Event counts, next meeting timing, and scheduling signals for the preview window.",
      },
      {
        title: "Tasks intelligence",
        description: "Todoist signals from overdue, due today, and priority — surfaced in Tasks and metrics row.",
      },
      {
        title: "Assistant context",
        description:
          "The assistant consumes the same snapshot via buildContextDigest — ask questions against this briefing, not a raw inbox dump.",
      },
    ],
    talkingPoints: [
      "Turn on MYASSIST_DEMO_MODE for a curated snapshot with no OAuth calls.",
      "Header shows Sample data; Refresh still works but stays on demo payload.",
      "Point at Briefing first, then metrics, then Inbox and Calendar panels.",
      "Open Assistant tab to show answers grounded in the same JSON digest the API uses.",
    ],
  };
}
