import { describe, expect, it } from "vitest";
import type { MyAssistDailyContext } from "@/lib/types";
import { buildDailySynthesis } from "./dailySynthesisService";
import { buildJobHuntExpansion } from "./jobHuntExpansionService";
import { buildProactiveIntelligence } from "./proactiveIntelligenceService";
import { buildTodayInsights } from "./todayIntelligenceService";

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

function compute(input: Parameters<typeof buildProactiveIntelligence>[0]) {
  return buildProactiveIntelligence(input);
}

describe("proactiveIntelligenceService", () => {
  it("first visit yields no changes but still builds briefing from synthesis", () => {
    const current = base({ todoist_overdue: [{ id: "o1", content: "Late task" }] });
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T18:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: null,
      lastVisitAt: null,
      currentContext: current,
      nowMs: Date.parse("2025-06-15T18:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(out.changesSinceLastVisit).toEqual([]);
    expect(out.morningBriefing.leadLine.length).toBeGreaterThan(5);
    expect(out.morningBriefing.bullets.length).toBeGreaterThanOrEqual(1);
  });

  it("detects new interview-style calendar event since previous snapshot", () => {
    const previous = base();
    const current = base({
      calendar_today: [
        {
          id: "ev-int",
          summary: "Technical interview — Acme",
          start: "2025-06-15T16:00:00-04:00",
          end: "2025-06-15T17:00:00-04:00",
          location: null,
        },
      ],
    });
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T18:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: previous,
      lastVisitAt: "2025-06-15T09:00:00.000Z",
      currentContext: current,
      nowMs: Date.parse("2025-06-15T18:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(out.changesSinceLastVisit.some((c) => c.kind === "new_interview")).toBe(true);
  });

  it("detects new overdue task ids", () => {
    const previous = base({ todoist_overdue: [{ id: "old1", content: "Was overdue" }] });
    const current = base({
      todoist_overdue: [
        { id: "old1", content: "Was overdue" },
        { id: "new1", content: "Just slipped" },
      ],
    });
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T18:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: previous,
      lastVisitAt: "2025-06-15T09:00:00.000Z",
      currentContext: current,
      nowMs: Date.parse("2025-06-15T18:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    const overdue = out.changesSinceLastVisit.filter((c) => c.kind === "new_overdue");
    expect(overdue.length).toBe(1);
    expect(overdue[0].title).toMatch(/Just slipped/);
  });

  it("detects new calendar conflict risk vs previous snapshot", () => {
    const previous = base({
      calendar_today: [
        {
          id: "a",
          summary: "Block A",
          start: "2025-06-15T10:00:00-04:00",
          end: "2025-06-15T11:30:00-04:00",
          location: null,
        },
        {
          id: "b",
          summary: "Block B",
          start: "2025-06-15T14:00:00-04:00",
          end: "2025-06-15T15:00:00-04:00",
          location: null,
        },
      ],
    });
    const current = base({
      calendar_today: [
        {
          id: "a",
          summary: "Block A",
          start: "2025-06-15T10:00:00-04:00",
          end: "2025-06-15T11:30:00-04:00",
          location: null,
        },
        {
          id: "b",
          summary: "Block B",
          start: "2025-06-15T10:15:00-04:00",
          end: "2025-06-15T10:45:00-04:00",
          location: null,
        },
      ],
    });
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T18:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: previous,
      lastVisitAt: "2025-06-15T09:00:00.000Z",
      currentContext: current,
      nowMs: Date.parse("2025-06-15T18:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(out.changesSinceLastVisit.some((c) => c.kind === "new_calendar_conflict")).toBe(true);
  });

  it("detects new follow-up-now job hunt row", () => {
    const previous = base();
    const current = base({
      gmail_signals: [
        {
          id: "m1",
          threadId: "t1",
          from: "Recruiter <r@co.com>",
          subject: "Old interview thread",
          snippet: "Ping us",
          date: "2025-06-01T12:00:00.000Z",
          job_hunt_analysis: {
            signals: ["interview_request"],
            confidence: 0.9,
            suggestedActions: ["create_prep_task"],
            stageAlias: "interview",
          },
        },
      ],
    });
    const nowMs = Date.parse("2025-06-15T18:00:00.000Z");
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, nowMs);
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    expect(jobHunt.followUpTiming.some((r) => r.status === "follow_up_now")).toBe(true);
    const out = compute({
      previousSnapshot: previous,
      lastVisitAt: "2025-06-15T09:00:00.000Z",
      currentContext: current,
      nowMs,
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(out.changesSinceLastVisit.some((c) => c.kind === "new_follow_up")).toBe(true);
  });

  it("morning briefing uses Welcome back when lastVisitAt is same Toronto calendar day", () => {
    const current = base();
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T18:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: base(),
      lastVisitAt: "2025-06-15T08:00:00.000Z",
      currentContext: current,
      nowMs: Date.parse("2025-06-15T22:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(out.morningBriefing.greetingLine).toBe("Welcome back");
  });

  it("morning briefing uses time-of-day greeting when last visit was a prior calendar day", () => {
    const current = base();
    const insights = buildTodayInsights(current);
    const jobHunt = buildJobHuntExpansion(current, Date.parse("2025-06-15T14:00:00.000Z"));
    const synthesis = buildDailySynthesis(current, insights, jobHunt);
    const out = compute({
      previousSnapshot: base({ run_date: "2025-06-14" }),
      lastVisitAt: "2025-06-14T22:00:00.000Z",
      currentContext: current,
      nowMs: Date.parse("2025-06-15T14:00:00.000Z"),
      dailySynthesis: synthesis,
      todayInsights: insights,
      jobHunt,
    });
    expect(["Good morning", "Good afternoon", "Good evening"]).toContain(out.morningBriefing.greetingLine);
  });
});
