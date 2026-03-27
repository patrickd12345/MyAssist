import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { POST } from "./route";

vi.mock("@/lib/jobHuntLifecycle", () => ({
  updateJobStage: vi.fn(),
}));
vi.mock("@/lib/jobHuntStageTodoistSync", () => ({
  maybeCreateTodoistTaskForJobStage: vi.fn(async () => ({ created: false, reason: "stage_not_mapped" })),
}));

import { updateJobStage } from "@/lib/jobHuntLifecycle";
import { maybeCreateTodoistTaskForJobStage } from "@/lib/jobHuntStageTodoistSync";

describe("/api/job-hunt/saved/[jobId]/stage", () => {
  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    vi.mocked(updateJobStage).mockResolvedValue({
      job_id: "job-1",
      track: "ai_focus",
      stage: "applied",
      interview_transcript_refs: [],
      timeline_events: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST updates stage", async () => {
    const req = new Request("http://localhost/api/job-hunt/saved/job-1/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "applied" }),
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect(updateJobStage).toHaveBeenCalledWith("job-1", "applied", undefined);
    expect(maybeCreateTodoistTaskForJobStage).toHaveBeenCalled();
  });

  it("POST returns 400 for invalid stage", async () => {
    const req = new Request("http://localhost/api/job-hunt/saved/job-1/stage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "not-a-real-stage" }),
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(400);
  });
});
