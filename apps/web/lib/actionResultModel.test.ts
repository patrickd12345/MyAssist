import { describe, expect, it } from "vitest";
import { buildFeedbackFromActionResponse, formatActionTypeLabel } from "./actionResultModel";

describe("actionResultModel", () => {
  it("formatActionTypeLabel maps known actions", () => {
    expect(formatActionTypeLabel("email_to_task")).toBe("Email → task");
  });

  it("buildFeedbackFromActionResponse maps success with created task", () => {
    const fb = buildFeedbackFromActionResponse({
      ok: true,
      action: "email_to_task",
      taskSummary: { id: "t1", content: "Follow up", url: "https://todoist.com/x" },
      refreshHints: { providers: ["todoist"] },
    });
    expect(fb?.outcome).toBe("success");
    expect(fb?.createdTargets?.[0]?.id).toBe("t1");
    expect(fb?.createdTargets?.[0]?.label).toContain("Follow up");
  });

  it("buildFeedbackFromActionResponse maps deduped responses", () => {
    const fb = buildFeedbackFromActionResponse({
      ok: true,
      action: "job_hunt_prep_tasks",
      dedupe: {
        deduped: true,
        message: "Prep tasks were already created recently.",
        reusedTargetIds: ["p1"],
        reusedTargetSummaries: [{ id: "p1", label: "[Job prep] Research company" }],
      },
      refreshHints: { providers: [] },
    });
    expect(fb?.outcome).toBe("deduped");
    expect(fb?.reusedTargets?.[0]?.label).toContain("Research");
  });

  it("buildFeedbackFromActionResponse maps failed bodies", () => {
    const fb = buildFeedbackFromActionResponse({
      ok: false,
      action: "email_to_event",
      error: "email_not_found",
      refreshHints: { providers: [] },
    });
    expect(fb?.outcome).toBe("failed");
    expect(fb?.message).toContain("email_not_found");
  });

  it("buildFeedbackFromActionResponse maps partial suggestion outcomes", () => {
    const fb = buildFeedbackFromActionResponse({
      ok: true,
      action: "email_to_event",
      outcome: "suggestion",
      draft: { summary: "x", description: "y", reason: "insufficient_datetime" },
      refreshHints: { providers: [] },
    });
    expect(fb?.outcome).toBe("partial");
  });
});
