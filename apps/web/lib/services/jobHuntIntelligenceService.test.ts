import { describe, expect, it } from "vitest";
import {
  analyzeEmail,
  analyzeEmails,
  extractJobIdentity,
  managerStageHintForAlias,
  stageAliasForSignals,
} from "./jobHuntIntelligenceService";

function signal(
  partial: Partial<{ id: string | null; threadId: string | null; from: string; subject: string; snippet: string }>,
): { id: string | null; threadId: string | null; from: string; subject: string; snippet: string } {
  return {
    id: partial.id ?? "m1",
    threadId: partial.threadId ?? "th1",
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

  it("detects S01-style application receipt language", () => {
    const a = analyzeEmail(
      signal({
        from: "Greenhouse <no-reply@greenhouse.io>",
        subject: "Your application to Acme Corp was received",
        snippet: "Thanks for applying. We'll review your application and get back to you.",
      }),
    );
    expect(a.signals).toContain("application_confirmation");
    expect(a.stageAlias).toBe("applied");
  });

  it("detects S02-style recruiter outreach language with recruiter domain", () => {
    const a = analyzeEmail(
      signal({
        from: "Sara Kim <sara@talent.contoso.com>",
        subject: "Senior Frontend Engineer opportunity at Contoso",
        snippet: "I came across your profile and wanted to reach out regarding an open role.",
      }),
    );
    expect(a.signals).toContain("follow_up");
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

  it("extracts normalized company, role and recruiter", () => {
    const identity = extractJobIdentity(
      signal({
        from: "Jane Recruiter <jane@acme.com>",
        subject: "Interview for Senior Backend Engineer role",
        snippet: "We would like to schedule a call with ACME Corp for the Senior Backend Engineer position.",
      }),
    );
    expect(identity.company).toBe("ACME Corp");
    expect(identity.role).toContain("Senior Backend Engineer");
    expect(identity.recruiterName).toBe("Jane Recruiter");
    expect(identity.threadId).toBe("th1");
    expect(identity.messageId).toBe("m1");
  });

  it("maps stage transition aliases deterministically", () => {
    expect(stageAliasForSignals(["application_confirmation"])).toBe("applied");
    expect(stageAliasForSignals(["interview_request"])).toBe("interview");
    expect(stageAliasForSignals(["technical_interview"])).toBe("technical");
    expect(stageAliasForSignals(["offer"])).toBe("offer");
    expect(stageAliasForSignals(["rejection"])).toBe("rejected");
    expect(managerStageHintForAlias("technical")).toBe("waiting_call");
  });

  it("uses multi-signal precedence with rejection highest", () => {
    const alias = stageAliasForSignals(["application_confirmation", "offer", "rejection"]);
    expect(alias).toBe("rejected");
  });

  it("extracts stable company across reply subject variants for continuity", () => {
    const a = extractJobIdentity(
      signal({
        from: "recruiter@contoso.com",
        subject: "Re: Interview — Software Engineer",
        snippet: "We would like to schedule an interview at Contoso for the engineering role.",
      }),
    );
    const b = extractJobIdentity(
      signal({
        from: "recruiter@contoso.com",
        subject: "Fwd: Interview — Software Engineer",
        snippet: "Following up on the Contoso application.",
      }),
    );
    expect(a.company).toBe("Contoso");
    expect(b.company).toBe("Contoso");
  });

  it("sanitizes company and role identity fragments", () => {
    const identity = extractJobIdentity(
      signal({
        from: "Ava Lin <ava@talent.fabrikam.com>",
        subject: "Fwd: interview availability",
        snippet:
          "Can you share availability for a screening call for the Senior Frontend Engineer role? Interview at Fabrikam is confirmed.",
      }),
    );
    expect(identity.company).toBe("Fabrikam");
    expect(identity.role).toBe("Senior Frontend Engineer");
  });

  it("cleans application-confirmation role titles (S01-style)", () => {
    const identity = extractJobIdentity(
      signal({
        from: "Greenhouse <no-reply@greenhouse.io>",
        subject: "Your application to Acme Corp was received",
        snippet:
          "Thanks for applying to the Product Manager role at Acme Corp. We will review your application shortly.",
      }),
    );
    expect(identity.role).toBe("Product Manager");
  });

  it("dedupes interview-family signals when technical_interview is present (S04-style)", () => {
    const a = analyzeEmail(
      signal({
        from: "Nina Patel <nina@adatum.com>",
        subject: "Technical interview invite",
        snippet:
          "We'd like to move you to a technical interview for the Backend Engineer role at Adatum.",
      }),
    );
    expect(a.signals).toContain("technical_interview");
    expect(a.signals).not.toContain("interview_request");
    expect(a.stageAlias).toBe("technical");
  });

  it("suppresses company/role/recruiter on analyzeEmail when non-job (S08/S14-style)", () => {
    const startupDigest = analyzeEmail(
      signal({
        from: "News <news@startupdigest.com>",
        subject: "Next steps to grow your startup",
        snippet: "A practical guide for founders. Schedule your strategy call today.",
      }),
    );
    expect(startupDigest.signals.length).toBe(0);
    expect(startupDigest.confidence).toBe(0);
    expect(startupDigest.normalizedIdentity?.company).toBeUndefined();
    expect(startupDigest.normalizedIdentity?.role).toBeUndefined();
    expect(startupDigest.normalizedIdentity?.recruiterName).toBeUndefined();
    expect(startupDigest.normalizedIdentity?.threadId).toBe("th1");

    const meetup = analyzeEmail(
      signal({
        from: "Community <events@meetup.com>",
        subject: "Let's meet this weekend",
        snippet: "Join our social meetup for coffee and networking.",
      }),
    );
    expect(meetup.signals.length).toBe(0);
    expect(meetup.normalizedIdentity?.company).toBeUndefined();
    expect(meetup.normalizedIdentity?.recruiterName).toBeUndefined();
  });
});
