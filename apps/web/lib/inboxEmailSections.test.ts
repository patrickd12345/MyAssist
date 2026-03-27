import { describe, expect, it } from "vitest";
import {
  INBOX_PRIORITY_IMPORTANCE_MIN,
  isPriorityInboxEmail,
  splitInboxEmails,
  inboxPriorityBadge,
} from "./inboxEmailSections";
import type { GmailSignal } from "./types";

function base(): GmailSignal {
  return {
    id: "m1",
    threadId: "t1",
    from: "a@b.com",
    subject: "Hello",
    snippet: "Body",
    date: "2026-01-01T12:00:00.000Z",
  };
}

describe("inboxEmailSections", () => {
  it("treats high importance_score as priority", () => {
    const g = { ...base(), importance_score: INBOX_PRIORITY_IMPORTANCE_MIN };
    expect(isPriorityInboxEmail(g)).toBe(true);
    expect(inboxPriorityBadge(g)).toBe("Priority");
  });

  it("treats job-hunt analysis above confidence with signals as priority", () => {
    const g: GmailSignal = {
      ...base(),
      job_hunt_analysis: {
        signals: ["interview_request"],
        confidence: 0.82,
        suggestedActions: [],
      },
    };
    expect(isPriorityInboxEmail(g)).toBe(true);
    expect(inboxPriorityBadge(g)).toBe("Signals");
  });

  it("does not treat low confidence job-hunt as priority", () => {
    const g: GmailSignal = {
      ...base(),
      job_hunt_analysis: {
        signals: ["interview_request"],
        confidence: 0.2,
        suggestedActions: [],
      },
    };
    expect(isPriorityInboxEmail(g)).toBe(false);
  });

  it("splits mixed lists: job-hunt in priority, plain in recent", () => {
    const plain = base();
    const jh: GmailSignal = {
      ...base(),
      id: "m2",
      job_hunt_analysis: {
        signals: ["follow_up"],
        confidence: 0.9,
        suggestedActions: [],
      },
    };
    const { priority, recent } = splitInboxEmails([plain, jh]);
    expect(priority.map((x) => x.id)).toEqual(["m2"]);
    expect(recent.map((x) => x.id)).toEqual(["m1"]);
  });

  it("puts all messages in recent when none qualify as priority", () => {
    const a = base();
    const b = { ...base(), id: "m2" };
    const { priority, recent } = splitInboxEmails([a, b]);
    expect(priority).toHaveLength(0);
    expect(recent).toHaveLength(2);
  });

  it("returns empty priority and recent for empty input", () => {
    expect(splitInboxEmails([])).toEqual({ priority: [], recent: [] });
  });
});
