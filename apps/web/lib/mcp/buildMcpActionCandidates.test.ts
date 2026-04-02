import { describe, expect, it } from "vitest";
import { buildMcpActionCandidates } from "./buildMcpActionCandidates";

describe("buildMcpActionCandidates", () => {
  it("builds complete_task candidates from overdue and due today without duplicates", () => {
    const ctx = {
      generated_at: "2026-01-01T12:00:00.000Z",
      todoist_overdue: [
        { id: "t1", content: "Overdue one", priority: 2 as const },
        { id: "t2", content: "Overdue two", priority: 3 as const },
      ],
      todoist_due_today: [{ id: "t3", content: "Today", priority: 1 as const }],
      gmail_signals: [],
    };
    const { candidates, generated_at } = buildMcpActionCandidates(ctx);
    expect(generated_at).toBe(ctx.generated_at);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.action_id)).toEqual([
      "complete_task:t1",
      "complete_task:t2",
      "complete_task:t3",
    ]);
    const m0 = candidates[0]?.metadata;
    const m2 = candidates[2]?.metadata;
    expect(m0 && "bucket" in m0 ? m0.bucket : null).toBe("overdue");
    expect(m2 && "bucket" in m2 ? m2.bucket : null).toBe("due_today");
  });

  it("dedupes the same task id if it appeared in both buckets", () => {
    const ctx = {
      generated_at: "2026-01-01T12:00:00.000Z",
      todoist_overdue: [{ id: "t1", content: "Dup", priority: 1 as const }],
      todoist_due_today: [{ id: "t1", content: "Dup", priority: 1 as const }],
      gmail_signals: [],
    };
    const { candidates } = buildMcpActionCandidates(ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.action_id).toBe("complete_task:t1");
  });

  it("adds email_to_task candidates for Gmail signals with ids", () => {
    const ctx = {
      generated_at: "2026-01-01T12:00:00.000Z",
      todoist_overdue: [],
      todoist_due_today: [],
      gmail_signals: [
        {
          id: "m1",
          threadId: "th1",
          from: "a@b.com",
          subject: "Hello",
          snippet: "hi",
          date: "Mon, 1 Jan 2024 00:00:00 +0000",
        },
      ],
    };
    const { candidates } = buildMcpActionCandidates(ctx);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.action_id).toBe("email_to_task:m1");
    expect(candidates[0]?.kind).toBe("email_to_task");
  });
});
