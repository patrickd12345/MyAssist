import { describe, expect, it } from "vitest";
import { dedupeJobs } from "../src/core/dedupe.js";
import type { UnifiedJob } from "../src/types/job.js";

function job(partial: Partial<UnifiedJob> & Pick<UnifiedJob, "id" | "title">): UnifiedJob {
  return {
    company: "Co",
    location: "",
    remote: false,
    type: "unknown",
    source: "rss",
    url: "https://x.example/j",
    posted_date: null,
    salary: null,
    description: "",
    tags: [],
    _fingerprint: "fp",
    ...partial,
  };
}

describe("dedupeJobs", () => {
  it("keeps one per fingerprint", () => {
    const a = job({ id: "a", title: "T1", _fingerprint: "same" });
    const b = job({
      id: "b",
      title: "T1",
      description: "x".repeat(90),
      _fingerprint: "same",
    });
    const out = dedupeJobs([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("b");
  });
});
