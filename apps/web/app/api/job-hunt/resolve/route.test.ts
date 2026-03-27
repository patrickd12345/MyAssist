import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { GET } from "./route";

vi.mock("@/lib/jobHuntResolve", () => ({
  fetchResolveJobFromStore: vi.fn(),
}));

import { fetchResolveJobFromStore } from "@/lib/jobHuntResolve";

describe("/api/job-hunt/resolve", () => {
  const originalDigestUrl = process.env.JOB_HUNT_DIGEST_URL;

  beforeEach(() => {
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    delete process.env.JOB_HUNT_DIGEST_URL;
    vi.mocked(fetchResolveJobFromStore).mockResolvedValue({
      ok: true,
      query: "",
      candidates: [],
      fetched: false,
      fetch_not_linkedin: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    if (originalDigestUrl === undefined) delete process.env.JOB_HUNT_DIGEST_URL;
    else process.env.JOB_HUNT_DIGEST_URL = originalDigestUrl;
  });

  it("GET resolves via job store with q", async () => {
    vi.mocked(fetchResolveJobFromStore).mockResolvedValue({
      ok: true,
      query: "4384",
      candidates: [],
      fetched: false,
      fetch_not_linkedin: false,
    });

    const req = new Request("http://localhost/api/job-hunt/resolve?q=4384");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(fetchResolveJobFromStore).toHaveBeenCalledWith("4384", {
      fetchOnline: false,
      track: undefined,
    });
  });

  it("GET passes fetch and track into job store resolver", async () => {
    vi.mocked(fetchResolveJobFromStore).mockResolvedValue({
      ok: true,
      query: "1",
      candidates: [],
      fetched: false,
      fetch_not_linkedin: false,
    });

    const req = new Request("http://localhost/api/job-hunt/resolve?q=1&fetch=1&track=sap_focus");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(fetchResolveJobFromStore).toHaveBeenCalledWith("1", {
      fetchOnline: true,
      track: "sap_focus",
    });
  });
});
