import { describe, expect, it } from "vitest";
import { analyzeEmail, analyzeEmails } from "./jobHuntIntelligenceService";

function signal(
  partial: Partial<{ from: string; subject: string; snippet: string }>,
): { from: string; subject: string; snippet: string } {
  return {
    from: partial.from ?? "recruiter@company.com",
    subject: partial.subject ?? "Role update",
    snippet: partial.snippet ?? "",
  };
}

describe("jobHuntIntelligenceService", () => {
  it("detects interview_request from scheduling language", () => {
    const a = analyzeEmail(
      signal({
        subject: "Interview next steps",
        snippet: "We would like to schedule an interview for the software engineer role at our company.",
      }),
    );
    expect(a.signals).toContain("interview_request");
    expect(a.confidence).toBeGreaterThanOrEqual(0.35);
    expect(a.suggestedActions).toContain("create_prep_task");
    expect(a.suggestedActions).toContain("suggest_calendar_block");
  });

  it("detects technical_interview", () => {
    const a = analyzeEmail(
      signal({
        subject: "Technical interview — system design",
        snippet: "The technical interview will cover architecture. Please join the Zoom link.",
      }),
    );
    expect(a.signals).toContain("technical_interview");
    expect(a.suggestedActions.length).toBeGreaterThan(0);
  });

  it("detects follow_up when job context is present", () => {
    const a = analyzeEmail(
      signal({
        subject: "Re: your application",
        snippet: "Just following up on your application for the backend role. What are the next steps?",
      }),
    );
    expect(a.signals).toContain("follow_up");
    expect(a.suggestedActions).toContain("create_followup_task");
  });

  it("detects offer language", () => {
    const a = analyzeEmail(
      signal({
        subject: "Formal offer",
        snippet: "We are pleased to offer you the position. Please review the compensation package attached.",
      }),
    );
    expect(a.signals).toContain("offer");
    expect(a.suggestedActions).toContain("update_pipeline");
  });

  it("detects rejection language", () => {
    const a = analyzeEmail(
      signal({
        subject: "Update on your application",
        snippet: "We regret to inform you that we will not be moving forward with your application.",
      }),
    );
    expect(a.signals).toContain("rejection");
    expect(a.suggestedActions).toContain("update_pipeline");
  });

  it("detects application confirmation", () => {
    const a = analyzeEmail(
      signal({
        subject: "Application received",
        snippet: "Thank you for applying. We have received your application for the open role.",
      }),
    );
    expect(a.signals).toContain("application_confirmation");
  });

  it("does not treat unrelated follow-up marketing as job follow_up", () => {
    const a = analyzeEmail(
      signal({
        from: "deals@shop.example",
        subject: "Following up on your cart",
        snippet: "We wanted to follow up on the items you left behind. Complete your purchase today.",
      }),
    );
    expect(a.signals).not.toContain("follow_up");
  });

  it("analyzeEmails returns one analysis per signal", () => {
    const out = analyzeEmails([
      {
        id: "1",
        threadId: null,
        from: "a@b.com",
        subject: "Offer letter",
        snippet: "Please find your formal offer attached.",
        date: "",
      },
      {
        id: "2",
        threadId: null,
        from: "c@d.com",
        subject: "Unrelated",
        snippet: "Lunch tomorrow?",
        date: "",
      },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]?.signals).toContain("offer");
    expect(out[1]?.signals.length ?? 0).toBe(0);
  });
});
