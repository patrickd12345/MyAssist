import { describe, expect, it } from "vitest";
import { getDemoWalkthrough } from "./demoScript";

describe("getDemoWalkthrough", () => {
  it("returns stable structure and six steps", () => {
    const w = getDemoWalkthrough();
    expect(w.title).toBe("MyAssist Demo Walkthrough");
    expect(w.description).toContain("MYASSIST_DEMO_MODE");
    expect(w.steps).toHaveLength(6);
    expect(w.steps.map((s) => s.title)).toEqual([
      "Good morning message",
      "Unified briefing",
      "Inbox intelligence",
      "Calendar intelligence",
      "Tasks intelligence",
      "Assistant context",
    ]);
    expect(w.talkingPoints.length).toBeGreaterThanOrEqual(3);
    expect(w.steps.every((s) => s.description.trim().length > 0)).toBe(true);
  });

  it("is deterministic across calls", () => {
    expect(JSON.stringify(getDemoWalkthrough())).toBe(JSON.stringify(getDemoWalkthrough()));
  });
});
