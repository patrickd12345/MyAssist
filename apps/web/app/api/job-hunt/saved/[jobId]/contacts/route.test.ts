import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { DELETE, POST } from "./route";

vi.mock("@/lib/jobHuntContactsStore", () => ({
  linkContactToJob: vi.fn(),
  unlinkContactFromJob: vi.fn(),
}));

import { linkContactToJob, unlinkContactFromJob } from "@/lib/jobHuntContactsStore";

describe("/api/job-hunt/saved/[jobId]/contacts", () => {
  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    vi.mocked(linkContactToJob).mockResolvedValue({
      id: "c1",
      job_id: "job-1",
      source: "manual",
      created_at: "2020-01-01",
    });
    vi.mocked(unlinkContactFromJob).mockResolvedValue({
      id: "c1",
      job_id: "",
      source: "manual",
      created_at: "2020-01-01",
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("POST links contact", async () => {
    const req = new Request("http://localhost/api/job-hunt/saved/job-1/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: "c1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect(linkContactToJob).toHaveBeenCalledWith("test-user", "c1", "job-1");
  });

  it("DELETE unlinks contact from job", async () => {
    const req = new Request(
      "http://localhost/api/job-hunt/saved/job-1/contacts?contact_id=c1",
      { method: "DELETE" },
    );
    const res = await DELETE(req, { params: Promise.resolve({ jobId: "job-1" }) });
    expect(res.status).toBe(200);
    expect(unlinkContactFromJob).toHaveBeenCalledWith("test-user", "c1", "job-1");
  });
});
