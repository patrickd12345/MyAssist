import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appendContactsFromParsedNotes } from "@/lib/jobHuntContactsStore";
import { parseJobNotesForContacts } from "@/lib/parseJobNotesContacts";
import { GET, POST } from "./route";

vi.mock("@/lib/parseJobNotesContacts", () => ({
  parseJobNotesForContacts: vi.fn(),
}));
vi.mock("@/lib/jobHuntContactsStore", () => ({
  appendContactsFromParsedNotes: vi.fn(),
}));

describe("/api/job-hunt/saved", () => {
  const originalFetch = globalThis.fetch;
  const originalDigestUrl = process.env.JOB_HUNT_DIGEST_URL;

  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    delete process.env.JOB_HUNT_DIGEST_URL;
    vi.mocked(parseJobNotesForContacts).mockReset();
    vi.mocked(appendContactsFromParsedNotes).mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    if (originalDigestUrl === undefined) delete process.env.JOB_HUNT_DIGEST_URL;
    else process.env.JOB_HUNT_DIGEST_URL = originalDigestUrl;
  });

  it("GET proxies to digest /saved-jobs with query string", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, jobs: [] }),
    });

    const req = new Request("http://localhost/api/job-hunt/saved?track=ai_focus");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/saved-jobs?track=ai_focus",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("GET degrades to empty jobs when digest is unreachable", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED"));

    const req = new Request("http://localhost/api/job-hunt/saved");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok?: boolean; jobs?: unknown[]; error?: string };
    expect(body.ok).toBe(false);
    expect(Array.isArray(body.jobs)).toBe(true);
    expect(body.jobs).toHaveLength(0);
    expect(typeof body.error).toBe("string");
  });

  it("POST proxies save-job body to digest", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, saved: { job_id: "x", track: "ai_focus", saved_at: "t" } }),
    });

    const req = new Request("http://localhost/api/job-hunt/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "job-1", track: "ai_focus", notes: "hello" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/save-job",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "job-1", track: "ai_focus", notes: "hello" }),
      }),
    );
  });

  it("POST forwards new_track to digest when present instead of track", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        saved: { job_id: "job-1", track: "my_custom_track", saved_at: "t" },
      }),
    });

    const req = new Request("http://localhost/api/job-hunt/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "job-1", new_track: { label: "Custom funnel" } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3847/save-job",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "job-1", new_track: { label: "Custom funnel" } }),
      }),
    );
  });

  it("POST returns 400 when id missing", async () => {
    globalThis.fetch = vi.fn();
    const req = new Request("http://localhost/api/job-hunt/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ track: "ai_focus" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("POST parses notes into contacts when extract_contacts is true", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, saved: { job_id: "job-1", track: "ai_focus", saved_at: "t" } }),
    });
    vi.mocked(parseJobNotesForContacts).mockResolvedValue({
      contacts: [{ name: "Pat", email: "pat@example.com" }],
      other_comments: ["Discussed comp band"],
      parse_mode: "ollama",
    });
    vi.mocked(appendContactsFromParsedNotes).mockResolvedValue({ people_added: 1, notes_added: 1 });

    const req = new Request("http://localhost/api/job-hunt/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "job-1",
        track: "ai_focus",
        notes: "Met Pat",
        extract_contacts: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      contacts_extraction?: { people_added: number; loose_notes_added: number };
    };
    expect(json.contacts_extraction?.people_added).toBe(1);
    expect(json.contacts_extraction?.loose_notes_added).toBe(1);
    expect(parseJobNotesForContacts).toHaveBeenCalledWith("Met Pat");
    expect(appendContactsFromParsedNotes).toHaveBeenCalled();
  });
});
