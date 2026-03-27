import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { HuntService } from "../src/services/hunt-service.js";

const tmpDir = join(process.cwd(), "tmp-test-store");

describe("HuntService", () => {
  let path: string;
  let svc: HuntService;

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true });
    path = join(tmpDir, `store-${Date.now()}.json`);
    svc = new HuntService(path);
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("create_track and list_tracks", async () => {
    const t = await svc.createTrack({ label: "Niche Role", default_keywords: ["rust"] });
    expect(t.id).toBeTruthy();
    const tracks = await svc.listTracks();
    expect(tracks.some((x) => x.id === t.id)).toBe(true);
  });

  it("save_job with new_track requires cached job", async () => {
    await expect(
      svc.saveJob({
        id: "missing",
        new_track: { label: "Temp" },
      }),
    ).rejects.toThrow(/Unknown job id/);
  });

  it("search_jobs with demo, save_job with new_track, mark_applied", async () => {
    const prev = process.env.JOB_HUNT_DEMO_JOBS;
    process.env.JOB_HUNT_DEMO_JOBS = "true";
    try {
      const r = await svc.searchJobs({ track: "ai_focus", limit: 5 });
      expect(r.returned).toBeGreaterThan(0);
      const id = r.jobs[0].id;
      await svc.saveJob({
        id,
        new_track: { label: "Custom hunt", default_keywords: ["kotlin"] },
      });
      await svc.markApplied({ id, applied_date: new Date().toISOString() });
      const listed = await svc.listSavedJobs({});
      expect(listed.some((x) => x.saved.job_id === id)).toBe(true);
      expect(Array.isArray(listed.find((x) => x.saved.job_id === id)?.touchpoints)).toBe(true);

      const sig = await svc.processEmailSignals([
        {
          from: "hr@other.com",
          subject: `[MA-JOB:${id}] Interview`,
          snippet: "Please confirm",
          date: new Date().toISOString(),
        },
      ]);
      const tagMatch = sig.matches.find((m) => m.job_id === id);
      expect(tagMatch?.match_reason).toBe("subject_job_id");
      expect(tagMatch?.match_score).toBe(100);
    } finally {
      if (prev === undefined) delete process.env.JOB_HUNT_DEMO_JOBS;
      else process.env.JOB_HUNT_DEMO_JOBS = prev;
    }
  });

  it("appendTimelineNote adds note without changing stage", async () => {
    const prev = process.env.JOB_HUNT_DEMO_JOBS;
    process.env.JOB_HUNT_DEMO_JOBS = "true";
    try {
      const r = await svc.searchJobs({ track: "ai_focus", limit: 1 });
      const id = r.jobs[0].id;
      await svc.saveJob({ id, track: "ai_focus" });
      const before = await svc.listSavedJobs({});
      const row = before.find((x) => x.saved.job_id === id);
      expect(row?.lifecycle.stage).toBe("lead");
      const lc = await svc.appendTimelineNote({ id, detail: "Followed up on email" });
      expect(lc.timeline_events.some((e) => e.kind === "note" && e.detail.includes("Followed up"))).toBe(true);
      expect(lc.stage).toBe("lead");
    } finally {
      if (prev === undefined) delete process.env.JOB_HUNT_DEMO_JOBS;
      else process.env.JOB_HUNT_DEMO_JOBS = prev;
    }
  });
});
