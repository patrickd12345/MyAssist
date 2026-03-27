import { describe, expect, it } from "vitest";
import type { GmailSignal, MyAssistDailyContext } from "@/lib/types";
import {
  buildJobHuntExpansion,
  buildResearchRowsForIdentity,
  coveredPrepItemIds,
  evaluateFollowUpTiming,
  missingPrepItems,
} from "./jobHuntExpansionService";

function base(overrides: Partial<MyAssistDailyContext> = {}): MyAssistDailyContext {
  return {
    generated_at: "2025-06-15T12:00:00.000Z",
    run_date: "2025-06-15",
    todoist_overdue: [],
    todoist_due_today: [],
    todoist_upcoming_high_priority: [],
    gmail_signals: [],
    calendar_today: [],
    ...overrides,
  };
}

describe("jobHuntExpansionService", () => {
  it("suggests missing prep items when interview signal and tasks do not cover prep", () => {
    const ctx = base({
      gmail_signals: [
        {
          id: "g1",
          threadId: "t1",
          from: "a@b.com",
          subject: "Interview scheduling",
          snippet: "Please book a time.",
          date: "2025-06-15T10:00:00.000Z",
          job_hunt_analysis: {
            signals: ["interview_request"],
            confidence: 0.6,
            suggestedActions: ["create_prep_task"],
          },
        },
      ],
    });
    const out = buildJobHuntExpansion(ctx);
    expect(out.prepRecommendations.length).toBeGreaterThanOrEqual(1);
    expect(out.prepRecommendations[0]?.missingItems.length).toBeGreaterThan(0);
  });

  it("does not duplicate prep suggestions when tasks already cover prep dimensions", () => {
    const ctx = base({
      todoist_due_today: [
        { id: "x1", content: "Research company Glassdoor and news" },
        { id: "x2", content: "Review role JD and requirements" },
        { id: "x3", content: "Prepare questions to ask panel" },
        { id: "x4", content: "Test microphone Zoom audio" },
        { id: "x5", content: "Tailor resume for role" },
      ],
      gmail_signals: [
        {
          id: "g1",
          threadId: "t1",
          from: "a@b.com",
          subject: "Technical interview",
          snippet: "Join Zoom.",
          date: "2025-06-15T10:00:00.000Z",
          job_hunt_analysis: {
            signals: ["technical_interview"],
            confidence: 0.7,
            suggestedActions: ["create_prep_task"],
          },
        },
      ],
    });
    const out = buildJobHuntExpansion(ctx);
    expect(out.prepRecommendations.length).toBe(0);
  });

  it("classifies follow-up timing conservatively from email age", () => {
    const now = new Date("2025-06-25T12:00:00.000Z").getTime();
    const signal: GmailSignal = {
      id: "g1",
      threadId: "t1",
      from: "a@b.com",
      subject: "Following up",
      snippet: "Next steps?",
      date: "2025-06-10T10:00:00.000Z",
      job_hunt_analysis: {
        signals: ["follow_up"],
        confidence: 0.5,
        suggestedActions: ["create_followup_task"],
      },
    };
    const row = evaluateFollowUpTiming(signal, signal.job_hunt_analysis, now);
    expect(row?.status).toBe("follow_up_now");
  });

  it("builds research rows when company and role present", () => {
    const row = buildResearchRowsForIdentity("Acme Corp", "Backend Engineer", "k1");
    expect(row).not.toBeNull();
    expect(row?.bullets.length).toBe(3);
    expect(row?.bullets[0]).toContain("Acme");
  });

  it("missingPrepItems returns full list when nothing covered", () => {
    const covered = coveredPrepItemIds([]);
    const m = missingPrepItems(covered);
    expect(m.length).toBe(5);
  });
});
