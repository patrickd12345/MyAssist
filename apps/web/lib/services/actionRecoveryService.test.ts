import { describe, expect, it } from "vitest";
import { findRecoverableEntry } from "./actionRecoveryService";
import type { StoredActionLogEntry } from "./crossSystemActionService";

describe("actionRecoveryService", () => {
  it("findRecoverableEntry returns latest matching calendar target", () => {
    const entries: StoredActionLogEntry[] = [
      {
        action: "email_to_event",
        status: "success",
        timestamp: "2026-01-01T00:00:00.000Z",
        sourceIds: ["m1"],
        targetIds: ["cal-old"],
        providers: ["gmail", "google_calendar"],
      },
      {
        action: "email_to_event",
        status: "success",
        timestamp: "2026-01-02T00:00:00.000Z",
        sourceIds: ["m2"],
        targetIds: ["cal-new"],
        providers: ["gmail", "google_calendar"],
      },
    ];
    expect(findRecoverableEntry(entries, "cal-new", "calendar")?.targetIds).toEqual(["cal-new"]);
  });

  it("findRecoverableEntry ignores deduped rows", () => {
    const entries: StoredActionLogEntry[] = [
      {
        action: "job_hunt_prep_tasks",
        status: "success",
        timestamp: "2026-01-01T00:00:00.000Z",
        sourceIds: ["m1"],
        targetIds: ["tp1"],
        providers: ["gmail", "todoist"],
        deduped: true,
      },
    ];
    expect(findRecoverableEntry(entries, "tp1", "todoist")).toBeNull();
  });
});
