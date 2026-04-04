import { describe, expect, it } from "vitest";
import { buildMyAssistBoundaryFromChat } from "./myassistMemoryBoundary";

describe("myassist memory boundary mapping", () => {
  it("fills sessionSummary and next_actions from assistant text", () => {
    const b = buildMyAssistBoundaryFromChat(
      [{ role: "user", content: "plan my day" }],
      "Focus on email first.",
    );
    expect(b.sessionSummary).toBe("Focus on email first.");
    expect(b.newlyActiveWork).toContain("plan my day");
    expect(b.next_actions[0]).toContain("Focus on email");
  });
});
