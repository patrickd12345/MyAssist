import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/jobHuntLifecycle", () => ({
  appendJobTimelineNote: vi.fn(),
}));

import { appendJobTimelineNote } from "@/lib/jobHuntLifecycle";

describe("/api/job-hunt/saved/[jobId]/notes", () => {
  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    vi.mocked(appendJobTimelineNote).mockResolvedValue({
      job_id: "job-1",
      track: "ai_focus",
      stage: "lead",
      interview_transcript_refs: [],
      timeline_events: [{ at: "2020-01-01T00:00:00.000Z", kind: "note", detail: "ok" }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST appends a timeline note", async () => {
    const req = new Request("http://localhost/api/job-hunt/saved/job-1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ detail: "  Follow up  " }),
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect(appendJobTimelineNote).toHaveBeenCalledWith("job-1", "Follow up");
    const body = (await res.json()) as { ok?: boolean };
    expect(body.ok).toBe(true);
  });

  it("POST returns 400 when detail missing", async () => {
    const req = new Request("http://localhost/api/job-hunt/saved/job-1/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(400);
  });
});
