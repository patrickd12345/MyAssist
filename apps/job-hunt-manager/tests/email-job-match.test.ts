import { describe, expect, it } from "vitest";
import {
  extractEmailDomain,
  extractJobIdFromMyAssistTag,
  inferStageFromEmailText,
  matchEmailToJob,
  shouldAdvanceStage,
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
