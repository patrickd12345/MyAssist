import { describe, expect, it } from "vitest";
import type { GmailMessage } from "@/lib/adapters/gmailAdapter";
import { analyzeEmail } from "./jobHuntIntelligenceService";
import { buildFollowUpTaskContent, buildFollowUpTaskDescription } from "./followUpDraftService";

describe("followUpDraftService", () => {
  it("uses company and role in task title when job analysis is strong", () => {
    const email: GmailMessage = {
      id: "m1",
      threadId: "th1",
      from: "Taylor Recruiter <talent@acme.com>",
      subject: "Re: Software Engineer role — next steps",
      snippet:
        "Following up regarding your application for the Software Engineer position. Let us know your availability.",
      date: "Mon, 15 Jun 2025 10:00:00 +0000",
      internalDate: "1718445600000",
      labelIds: [],
    };
    const analysis = analyzeEmail({
      id: email.id,
      threadId: email.threadId,
      from: email.from,
      subject: email.subject,
      snippet: email.snippet,
    });
    const title = buildFollowUpTaskContent(email, analysis);
    expect(title).toMatch(/^Follow up:/i);
    expect(title).toMatch(/Software Engineer/i);
    expect(title).toMatch(/Acme/i);
    const desc = buildFollowUpTaskDescription(email, analysis);
    expect(desc).toContain("mail.google.com");
    expect(desc.length).toBeLessThan(2000);
    expect(desc).not.toMatch(/as soon as possible|at your earliest|hope this email finds/i);
  });

  it("falls back to cleaned subject when no job signals", () => {
    const email: GmailMessage = {
      id: "m2",
      threadId: "th2",
      from: "Bob",
      subject: "Re: Quarterly report",
      snippet: "Ping me when ready.",
      date: "Mon, 15 Jun 2025 10:00:00 +0000",
      internalDate: null,
      labelIds: [],
    };
    const analysis = analyzeEmail({
      id: email.id,
      threadId: email.threadId,
      from: email.from,
      subject: email.subject,
      snippet: email.snippet,
    });
    expect(buildFollowUpTaskContent(email, analysis)).toContain("Quarterly report");
  });
});
