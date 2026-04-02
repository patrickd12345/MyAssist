import { describe, expect, it } from "vitest";
import { buildUnifiedDailyBriefing } from "./unifiedDailyBriefing";
import { parseAssistantStructuredReply } from "./assistantStructuredReply";
import type { MyAssistDailyContext } from "./types";

describe("parseAssistantStructuredReply", () => {
  it("parses structured JSON with actions and followUps", () => {
    const raw = JSON.stringify({
      answer: "Do the overdue task first.",
      actions: ["Complete task A", "Reply to recruiter"],
      followUps: ["Any blockers?"],
    });
    const parsed = parseAssistantStructuredReply(raw);
    expect(parsed.answer).toBe("Do the overdue task first.");
    expect(parsed.actions).toEqual(["Complete task A", "Reply to recruiter"]);
    expect(parsed.followUps).toEqual(["Any blockers?"]);
    expect(parsed.taskDraft).toBeNull();
  });

  it("returns fallback when answer is missing", () => {
    const parsed = parseAssistantStructuredReply(JSON.stringify({ actions: [] }));
    expect(parsed.answer).toContain("could not generate");
  });

  it("rejects context-shaped JSON dumps", () => {
    const dump = JSON.stringify({
      run_date: "2026-01-01",
      todoist_overdue: [],
      gmail_signals: [],
    });
    const parsed = parseAssistantStructuredReply(dump);
    expect(parsed.answer).toContain("could not generate");
  });

  it("parses taskDraft when present", () => {
    const raw = JSON.stringify({
      answer: "Created draft.",
      taskDraft: { content: "Call back", dueString: "tomorrow", priority: 3 },
    });
    const parsed = parseAssistantStructuredReply(raw);
    expect(parsed.taskDraft).toEqual({
      content: "Call back",
      dueString: "tomorrow",
      description: null,
      priority: 3,
    });
  });
});

describe("golden: assistant + briefing pipeline", () => {
  it("keeps assistant JSON shape compatible with briefing digest usage", async () => {
    const ctx: MyAssistDailyContext = {
      generated_at: "2026-04-02T12:00:00.000Z",
      run_date: "2026-04-02",
      todoist_overdue: [],
      todoist_due_today: [{ content: "x", priority: 1, id: "1" }],
      todoist_upcoming_high_priority: [],
      gmail_signals: [],
      calendar_today: [],
    };
    const briefing = await buildUnifiedDailyBriefing(ctx);
    const assistantStyle = parseAssistantStructuredReply(
      JSON.stringify({
        answer: briefing.summary,
        actions: briefing.urgent.slice(0, 2),
        followUps: ["What is the single next step?"],
      }),
    );
    expect(assistantStyle.answer.length).toBeGreaterThan(10);
    expect(assistantStyle.actions.length).toBeLessThanOrEqual(2);
  });
});
