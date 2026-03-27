import { describe, expect, it } from "vitest";
import { allPostingIdsForContact, contactAppliesToJob, primaryJobIdIsBlank } from "./jobHuntContactUtils";
import type { JobHuntPersonContact } from "./jobHuntContactTypes";

function person(p: Partial<JobHuntPersonContact>): JobHuntPersonContact {
  return {
    id: "1",
    job_id: "",
    source: "manual",
    created_at: "2020-01-01",
    ...p,
  };
}

describe("primaryJobIdIsBlank", () => {
  it("treats whitespace-only as blank", () => {
    expect(primaryJobIdIsBlank("")).toBe(true);
    expect(primaryJobIdIsBlank("   ")).toBe(true);
    expect(primaryJobIdIsBlank(null)).toBe(true);
    expect(primaryJobIdIsBlank(undefined)).toBe(true);
  });

  it("false when id present", () => {
    expect(primaryJobIdIsBlank("4384125483")).toBe(false);
  });
});

describe("allPostingIdsForContact", () => {
  it("merges primary and linked without duplicates", () => {
    const p = person({ job_id: "a", linked_job_ids: ["a", "b"] });
    expect(allPostingIdsForContact(p)).toEqual(["a", "b"]);
  });
});

describe("contactAppliesToJob", () => {
  it("matches primary with trim", () => {
    const p = person({ job_id: "  abc  " });
    expect(contactAppliesToJob(p, "abc")).toBe(true);
  });

  it("matches linked ids with trim", () => {
    const p = person({ job_id: "", linked_job_ids: ["  x  ", "y"] });
    expect(contactAppliesToJob(p, "x")).toBe(true);
    expect(contactAppliesToJob(p, "y")).toBe(true);
  });
});
