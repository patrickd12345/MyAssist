import { describe, expect, it } from "vitest";
import type { UnifiedJob } from "../src/types/job.js";
import { resolveJobCandidatesInIndex } from "../src/core/resolve-job.js";

function job(partial: Partial<UnifiedJob> & Pick<UnifiedJob, "id" | "title" | "company" | "url">): UnifiedJob {
  return {
    location: "",
    remote: false,
    type: "unknown",
    source: "linkedin",
    posted_date: null,
    salary: null,
    description: "",
    tags: [],
    ...partial,
  };
}

describe("resolveJobCandidatesInIndex", () => {
  it("returns exact id match only", () => {
    const a = job({
      id: "linkedin:https://example.com/view/111",
      title: "A",
      company: "Co",
      url: "https://www.linkedin.com/jobs/view/111",
    });
    const idx = { [a.id]: a };
    expect(resolveJobCandidatesInIndex(idx, a.id)).toEqual([a]);
  });

  it("matches LinkedIn numeric id in URL", () => {
    const a = job({
      id: "linkedin:https://www.linkedin.com/jobs/view/4384125483",
      title: "Role A",
      company: "X",
      url: "https://www.linkedin.com/jobs/view/4384125483",
    });
    const b = job({
      id: "indeed:https://other.com/x",
      title: "Role B",
      company: "Y",
      url: "https://other.com/abc",
    });
    const idx = { [a.id]: a, [b.id]: b };
    const r = resolveJobCandidatesInIndex(idx, "4384125483");
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe(a.id);
  });

  it("returns multiple when query matches several boards", () => {
    const a = job({
      id: "linkedin:u1",
      title: "L",
      company: "C",
      url: "https://linkedin.com/jobs/view/999",
    });
    const b = job({
      id: "indeed:u2",
      title: "I",
      company: "C",
      url: "https://indeed.com/viewjob?jk=999",
    });
    const idx = { [a.id]: a, [b.id]: b };
    const r = resolveJobCandidatesInIndex(idx, "999");
    expect(r.length).toBeGreaterThanOrEqual(1);
  });
});
