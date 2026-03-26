import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/jobHuntEmailAssignment", () => ({
  assignEmailSignalToJob: vi.fn(async () => ({ ok: true, touchpoint_logged: true })),
}));

import { assignEmailSignalToJob } from "@/lib/jobHuntEmailAssignment";

describe("/api/job-hunt/email/assign", () => {
  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("assigns an email signal to a saved job", async () => {
    const req = new Request("http://localhost/api/job-hunt/email/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: "job-123",
        signal: {
          id: "m1",
          threadId: "t1",
          from: "Recruiter <recruiter@acme.com>",
          subject: "Interview scheduling",
          snippet: "Can we set up a call?",
          date: "2026-03-26T00:00:00.000Z",
        },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(assignEmailSignalToJob).toHaveBeenCalledWith(
      "test-user",
      expect.objectContaining({ job_id: "job-123" }),
    );
  });

  it("returns 400 for missing job_id", async () => {
    const req = new Request("http://localhost/api/job-hunt/email/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signal: {
          from: "Recruiter <recruiter@acme.com>",
          subject: "Interview scheduling",
          snippet: "Can we set up a call?",
          date: "2026-03-26T00:00:00.000Z",
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
