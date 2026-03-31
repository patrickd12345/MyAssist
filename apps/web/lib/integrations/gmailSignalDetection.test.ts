import { describe, expect, it } from "vitest";
import type { GmailNormalizedMessage } from "./gmailNormalize";
import { detectSignals } from "./gmailSignalDetection";

function nm(overrides: Partial<GmailNormalizedMessage> & { messageId: string }): GmailNormalizedMessage {
  return {
    messageId: overrides.messageId,
    threadId: overrides.threadId !== undefined ? overrides.threadId : null,
    internalDate: overrides.internalDate !== undefined ? overrides.internalDate : null,
    dateHeader: overrides.dateHeader !== undefined ? overrides.dateHeader : null,
    from: overrides.from ?? "sender@example.com",
    subject: overrides.subject ?? "(no subject)",
    snippet: overrides.snippet ?? "",
    labelIds: overrides.labelIds ?? [],
    unread: overrides.unread ?? false,
    important: overrides.important ?? false,
    providerAccountId: overrides.providerAccountId !== undefined ? overrides.providerAccountId : null,
    normalizedAt: overrides.normalizedAt ?? "2024-01-01T00:00:00.000Z",
  };
}

describe("detectSignals", () => {
  it("flags interview email with job_interview", () => {
    const messages = [
      nm({
        messageId: "m1",
        subject: "Technical interview next week",
        snippet: "We would like to schedule an interview for the role.",
      }),
    ];
    const s = detectSignals(messages);
    expect(s.some((x) => x.type === "job_interview")).toBe(true);
    expect(s.find((x) => x.type === "job_interview")?.messageId).toBe("m1");
  });

  it("flags recruiter outreach", () => {
    const s = detectSignals([
      nm({
        messageId: "m2",
        from: "recruiter@talent.example.com",
        subject: "Opportunity",
        snippet: "I am a recruiter reaching out about a position.",
      }),
    ]);
    expect(s.some((x) => x.type === "job_recruiter")).toBe(true);
  });

  it("produces few or no job signals for generic newsletter-style spam", () => {
    const s = detectSignals([
      nm({
        messageId: "m3",
        from: "news@shop.example",
        subject: "Weekly deals — 50% off",
        snippet: "Buy now. Unsubscribe here.",
      }),
    ]);
    expect(s.filter((x) => x.type.startsWith("job_")).length).toBe(0);
  });

  it("flags action_required when please confirm appears", () => {
    const s = detectSignals([
      nm({
        messageId: "m4",
        subject: "Action",
        snippet: "Please confirm your attendance by Friday.",
      }),
    ]);
    expect(s.some((x) => x.type === "action_required")).toBe(true);
  });

  it("collapses duplicate messageId+type from repeated rows", () => {
    const row = nm({
      messageId: "m5",
      subject: "Interview schedule",
      snippet: "Phone interview",
    });
    const s = detectSignals([row, { ...row, snippet: "Phone interview updated" }]);
    const interviews = s.filter((x) => x.type === "job_interview" && x.messageId === "m5");
    expect(interviews.length).toBeLessThanOrEqual(1);
  });

  it("marks important when Gmail IMPORTANT label and unread", () => {
    const s = detectSignals([
      nm({
        messageId: "m6",
        subject: "FYI",
        snippet: "Note",
        unread: true,
        important: true,
        labelIds: ["IMPORTANT", "UNREAD"],
      }),
    ]);
    expect(s.some((x) => x.type === "important")).toBe(true);
  });

  it("detects calendar-related scheduling copy", () => {
    const s = detectSignals([
      nm({
        messageId: "m7",
        subject: "Meet",
        snippet: "Use this calendly link to book a time on zoom.us",
      }),
    ]);
    expect(s.some((x) => x.type === "calendar_related")).toBe(true);
  });
});
