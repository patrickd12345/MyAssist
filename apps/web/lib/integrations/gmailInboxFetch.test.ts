import { describe, expect, it } from "vitest";
import {
  clampGmailPageSize,
  GMAIL_INBOX_DEFAULT_MAX_RESULTS,
  GMAIL_INBOX_HARD_MAX_RESULTS,
  parseGmailMetadataToPreview,
  sanitizeGmailQuery,
} from "./gmailInboxFetch";

describe("gmailInboxFetch limits", () => {
  it("defaults to GMAIL_INBOX_DEFAULT_MAX_RESULTS when undefined or invalid", () => {
    expect(clampGmailPageSize(undefined)).toBe(GMAIL_INBOX_DEFAULT_MAX_RESULTS);
    expect(clampGmailPageSize(Number.NaN)).toBe(GMAIL_INBOX_DEFAULT_MAX_RESULTS);
  });

  it("hard-caps at GMAIL_INBOX_HARD_MAX_RESULTS", () => {
    expect(clampGmailPageSize(9999)).toBe(GMAIL_INBOX_HARD_MAX_RESULTS);
    expect(clampGmailPageSize(GMAIL_INBOX_HARD_MAX_RESULTS + 1)).toBe(GMAIL_INBOX_HARD_MAX_RESULTS);
  });

  it("floors at 1", () => {
    expect(clampGmailPageSize(0)).toBe(1);
    expect(clampGmailPageSize(-5)).toBe(1);
  });
});

describe("sanitizeGmailQuery", () => {
  it("allows explicit empty or whitespace (no fallback)", () => {
    expect(sanitizeGmailQuery("", "in:inbox")).toBe("");
    expect(sanitizeGmailQuery("   ", "in:inbox")).toBe("");
  });

  it("collapses newlines and trims length", () => {
    expect(sanitizeGmailQuery("a\nb\rc", "x")).toBe("a b c");
  });
});

describe("parseGmailMetadataToPreview", () => {
  it("derives unread and important from labelIds", () => {
    const p = parseGmailMetadataToPreview(
      {
        id: "m1",
        threadId: "t1",
        internalDate: "123",
        snippet: "hi",
        labelIds: ["INBOX", "UNREAD", "IMPORTANT"],
        payload: {
          headers: [
            { name: "From", value: "a@b.com" },
            { name: "Subject", value: "S" },
            { name: "Date", value: "Mon, 1 Jan 2024 00:00:00 +0000" },
          ],
        },
      },
      "m1",
    );
    expect(p).not.toBeNull();
    expect(p?.unread).toBe(true);
    expect(p?.important).toBe(true);
    expect(p?.labelIds).toEqual(["INBOX", "UNREAD", "IMPORTANT"]);
  });
});
