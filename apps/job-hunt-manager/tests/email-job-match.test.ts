import { describe, expect, it } from "vitest";
import {
  compareMatchTieBreak,
  extractEmailDomain,
  extractJobIdFromMyAssistTag,
  inferStageFromEmailText,
  matchEmailToJob,
  normalizeSubjectForLinking,
  roleTokenOverlapForJob,
  shouldAdvanceStage,
  subjectTokenOverlapForJob,
} from "../src/core/email-job-match.js";
import type { EmailSignalInput } from "../src/types/lifecycle.js";
import type { UnifiedJob } from "../src/types/job.js";

function job(partial: Partial<UnifiedJob> & Pick<UnifiedJob, "id" | "title" | "company" | "url">): UnifiedJob {
  return {
    location: "Toronto",
    remote: false,
    type: "permanent",
    source: "company",
    posted_date: null,
    salary: null,
    description: "",
    tags: [],
    ...partial,
  };
}

describe("matchEmailToJob", () => {
  it("matches sender domain to company career site", () => {
    const signal: EmailSignalInput = {
      from: "Recruiter <jobs@acme.com>",
      subject: "Update on your application",
      snippet: "We are still reviewing.",
      date: "2025-01-01",
    };
    const j = job({
      id: "1",
      title: "Engineer",
      company: "Acme",
      url: "https://careers.acme.com/job/1",
    });
    const m = matchEmailToJob(signal, j);
    expect(m).not.toBeNull();
    expect(m?.reason).toBe("sender_domain");
  });

  it("matches via normalized identity when sender is generic and role aligns", () => {
    const signal: EmailSignalInput = {
      from: "noreply@linkedin.com",
      subject: "Re: Senior Backend Engineer — Acme Corp",
      snippet: "Following up on your application for the Senior Backend Engineer role at Acme Corp.",
      date: "2025-01-01",
      normalizedIdentity: {
        company: "Acme Corp",
        role: "Senior Backend Engineer",
        recruiterName: "Jane",
      },
    };
    const j = job({
      id: "acme-1",
      title: "Senior Backend Engineer",
      company: "Acme Corp",
      url: "https://linkedin.com/jobs/999",
    });
    const m = matchEmailToJob(signal, j);
    expect(m).not.toBeNull();
    expect(m?.reason === "normalized_identity" || m?.reason === "company_and_recruitment").toBe(true);
    expect(m?.score).toBeGreaterThanOrEqual(66);
  });

  it("does not match unrelated company in normalized identity", () => {
    const signal: EmailSignalInput = {
      from: "x@y.com",
      subject: "Update",
      snippet: "Regarding your application.",
      date: "2025-01-01",
      normalizedIdentity: {
        company: "OtherCo",
        role: "Engineer",
      },
    };
    const j = job({
      id: "1",
      title: "Engineer",
      company: "Acme Corp",
      url: "https://acme.com/jobs/1",
    });
    expect(matchEmailToJob(signal, j)).toBeNull();
  });

  it("matches company name plus recruitment keywords", () => {
    const signal: EmailSignalInput = {
      from: "noreply@linkedin.com",
      subject: "Contoso — interview next steps",
      snippet: "Contoso would like to schedule your interview.",
      date: "2025-01-01",
    };
    const j = job({
      id: "2",
      title: "PM",
      company: "Contoso",
      url: "https://linkedin.com/jobs/123",
    });
    const m = matchEmailToJob(signal, j);
    expect(m).not.toBeNull();
    expect(m?.reason).toBe("company_and_recruitment");
  });
});

describe("inferStageFromEmailText", () => {
  it("detects rejection", () => {
    expect(inferStageFromEmailText("Update", "unfortunately we will not move forward")).toBe("closed_lost");
  });

  it("detects interview scheduling", () => {
    expect(inferStageFromEmailText("Interview invitation", "please book a time")).toBe("interview_scheduled");
  });
});

describe("shouldAdvanceStage", () => {
  it("advances applied to interview_scheduled", () => {
    expect(shouldAdvanceStage("applied", "interview_scheduled")).toBe(true);
  });

  it("does not downgrade", () => {
    expect(shouldAdvanceStage("offer", "interview_scheduled")).toBe(false);
  });
});

describe("extractEmailDomain", () => {
  it("parses angle-bracket address", () => {
    expect(extractEmailDomain('Name <a@example.com>')).toBe("example.com");
  });
});

describe("normalizeSubjectForLinking", () => {
  it("strips reply prefixes for cross-email comparison", () => {
    expect(normalizeSubjectForLinking("Re: Senior Engineer — Acme")).toContain("senior engineer");
    expect(normalizeSubjectForLinking("Fwd: Interview scheduling")).toContain("interview scheduling");
  });
});

describe("extractJobIdFromMyAssistTag", () => {
  it("parses bracket tag with colons in id", () => {
    expect(extractJobIdFromMyAssistTag("Re: [MA-JOB:linkedin:https://x] follow up")).toBe("linkedin:https://x");
  });

  it("is case-insensitive on MA-JOB", () => {
    expect(extractJobIdFromMyAssistTag("[ma-job:simple_id] hello")).toBe("simple_id");
  });

  it("returns null when tag absent", () => {
    expect(extractJobIdFromMyAssistTag("No tag here")).toBeNull();
  });
});

describe("match tie-break helpers", () => {
  it("prefers thread match, then role overlap, then subject overlap, then stable job id", () => {
    const signal: EmailSignalInput = {
      id: "m1",
      threadId: "th1",
      from: "Recruiter <r@talent.example.com>",
      subject: "Interview availability for Senior Backend Engineer",
      snippet: "Can we schedule a call?",
      date: "2025-01-01",
      normalizedIdentity: {
        role: "Senior Backend Engineer",
      },
    };
    const jA = job({ id: "a-job", title: "Senior Backend Engineer", company: "Acme", url: "https://acme.com/jobs/1" });
    const jB = job({ id: "b-job", title: "Backend Engineer", company: "Acme", url: "https://acme.com/jobs/2" });
    expect(roleTokenOverlapForJob(signal, jA)).toBeGreaterThan(roleTokenOverlapForJob(signal, jB));
    expect(subjectTokenOverlapForJob(signal, jA)).toBeGreaterThanOrEqual(subjectTokenOverlapForJob(signal, jB));

    const threadWins = compareMatchTieBreak(
      { threadIdExact: true, roleOverlap: 1, subjectOverlap: 1, jobId: "x" },
      { threadIdExact: false, roleOverlap: 3, subjectOverlap: 3, jobId: "y" },
    );
    expect(threadWins).toBeGreaterThan(0);

    const roleWins = compareMatchTieBreak(
      { threadIdExact: false, roleOverlap: 2, subjectOverlap: 1, jobId: "x" },
      { threadIdExact: false, roleOverlap: 1, subjectOverlap: 5, jobId: "y" },
    );
    expect(roleWins).toBeGreaterThan(0);

    const subjectWins = compareMatchTieBreak(
      { threadIdExact: false, roleOverlap: 1, subjectOverlap: 2, jobId: "x" },
      { threadIdExact: false, roleOverlap: 1, subjectOverlap: 1, jobId: "y" },
    );
    expect(subjectWins).toBeGreaterThan(0);

    const stableFallback = compareMatchTieBreak(
      { threadIdExact: false, roleOverlap: 0, subjectOverlap: 0, jobId: "a-job" },
      { threadIdExact: false, roleOverlap: 0, subjectOverlap: 0, jobId: "b-job" },
    );
    expect(stableFallback).toBeGreaterThan(0);
  });
});
