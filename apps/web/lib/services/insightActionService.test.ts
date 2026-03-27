import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeInsightAction, insightActionPendingKey } from "./insightActionService";

describe("insightActionService", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, refreshHints: { providers: [] } }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("create_prep_tasks posts job_hunt_prep_tasks with message id", async () => {
    const fetchMock = vi.mocked(fetch);
    await executeInsightAction({
      type: "create_prep_tasks",
      payload: { messageId: "msg-abc" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "job_hunt_prep_tasks", sourceId: "msg-abc" }),
      }),
    );
  });

  it("create_followup_task posts email_to_task with message id", async () => {
    const fetchMock = vi.mocked(fetch);
    await executeInsightAction({
      type: "create_followup_task",
      payload: { messageId: "msg-xyz" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "email_to_task", sourceId: "msg-xyz" }),
      }),
    );
  });

  it("block_focus_time with messageId posts email_to_event", async () => {
    const fetchMock = vi.mocked(fetch);
    await executeInsightAction({
      type: "block_focus_time",
      payload: { messageId: "msg-cal" },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/actions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "email_to_event", sourceId: "msg-cal" }),
      }),
    );
  });

  it("insightActionPendingKey is stable for the same automation payload", () => {
    const a = {
      type: "create_prep_tasks" as const,
      payload: { messageId: "m1" },
    };
    expect(insightActionPendingKey("i1", a)).toBe(insightActionPendingKey("i1", { ...a }));
  });
});
