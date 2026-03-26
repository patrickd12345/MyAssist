import { describe, expect, it, vi, afterEach } from "vitest";
import { parseJobNotesForContacts } from "./parseJobNotesContacts";

describe("parseJobNotesForContacts", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("falls back to heuristic when Ollama is unavailable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

    const r = await parseJobNotesForContacts("Pat Lee recruiter pat@agency.com — try +1 514-555-0142");

    expect(r.parse_mode).toBe("heuristic");
    expect(r.contacts.some((c) => c.email === "pat@agency.com")).toBe(true);
    expect(r.contacts.some((c) => c.phone?.includes("514"))).toBe(true);
  });

  it("parses staffing firm, email-derived name, and status line (Randstad example)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connection refused"));

    const notes = `The firm referring this job is Randstad. The contact name (who I met this morning) is 
caroline.goulet@randstaddigital.com. The status is that she will talk to Dollorama about me and book an interview with the client`;

    const r = await parseJobNotesForContacts(notes);

    expect(r.parse_mode).toBe("heuristic");
    const row = r.contacts.find((c) => c.email === "caroline.goulet@randstaddigital.com");
    expect(row).toBeDefined();
    expect(row?.company).toBe("Randstad");
    expect(row?.name).toBe("Caroline Goulet");
    expect(row?.role).toBe("recruiter");
    expect(r.other_comments.length).toBeGreaterThan(0);
    expect(r.other_comments[0]).toMatch(/talk to Dollorama/i);
  });

  it("returns none for empty notes", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("no"));
    const r = await parseJobNotesForContacts("  ");
    expect(r.parse_mode).toBe("none");
    expect(r.contacts.length).toBe(0);
  });
});
