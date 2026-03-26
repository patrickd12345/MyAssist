import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const emailToTask = vi.fn();
const emailToEvent = vi.fn();
const taskToCalendarBlock = vi.fn();
const completeTask = vi.fn();
const archiveEmail = vi.fn();

vi.mock("@/lib/session", () => ({
  getSessionUserId: vi.fn(async () => "user-1"),
}));

vi.mock("@/lib/services/crossSystemActionService", () => ({
  createCrossSystemActionService: vi.fn(() => ({
    emailToTask,
    emailToEvent,
    taskToCalendarBlock,
    completeTask,
    archiveEmail,
  })),
}));

describe("POST /api/actions", () => {
  let POST: (req: Request) => Promise<Response>;

  beforeAll(async () => {
    const mod = await import("./route");
    POST = mod.POST;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    emailToTask.mockResolvedValue({
      ok: true,
      action: "email_to_task",
      sourceEmailId: "m1",
      taskSummary: { id: "t1", content: "Hi", url: null },
      refreshHints: { providers: ["gmail", "todoist"], sourceIds: ["m1"], targetIds: ["t1"] },
    });
  });

  it("returns 400 when sourceId is missing", async () => {
    const res = await POST(
      new Request("http://localhost/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email_to_task" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when action is invalid", async () => {
    const res = await POST(
      new Request("http://localhost/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "not_real", sourceId: "x" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("dispatches email_to_task and returns service payload", async () => {
    const res = await POST(
      new Request("http://localhost/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "email_to_task", sourceId: "m1" }),
      }),
    );
    expect(res.status).toBe(200);
    expect(emailToTask).toHaveBeenCalledWith("m1");
    const json = (await res.json()) as { ok: boolean; sourceEmailId?: string };
    expect(json.ok).toBe(true);
    expect(json.sourceEmailId).toBe("m1");
  });
});
