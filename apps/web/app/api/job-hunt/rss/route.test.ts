import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSessionUserId = vi.fn();
vi.mock("@/lib/session", () => ({
  getSessionUserId: () => mockGetSessionUserId(),
}));

describe("/api/job-hunt/rss", () => {
  let tmp: string;
  let prevRssFile: string | undefined;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "web-rss-"));
    prevRssFile = process.env.JOB_HUNT_RSS_SOURCES_FILE;
    process.env.JOB_HUNT_RSS_SOURCES_FILE = join(tmp, "rss-sources.json");
    process.env.MYASSIST_AUTH_DISABLED = "true";
    process.env.MYASSIST_DEV_USER_ID = "test-user";
    mockGetSessionUserId.mockResolvedValue("test-user");
  });

  afterEach(() => {
    if (prevRssFile === undefined) delete process.env.JOB_HUNT_RSS_SOURCES_FILE;
    else process.env.JOB_HUNT_RSS_SOURCES_FILE = prevRssFile;
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    vi.resetModules();
  });

  it("GET returns ok and file path when authorized", async () => {
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; filePath?: string };
    expect(body.ok).toBe(true);
    expect(body.filePath).toContain("rss-sources.json");
  });

  it("GET returns 401 when not authorized", async () => {
    mockGetSessionUserId.mockResolvedValueOnce(null);
    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(401);
  });
});
