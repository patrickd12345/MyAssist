import { describe, expect, it } from "vitest";
import { isMyAssistDailyContext } from "./validateContext";

const minimalValid = {
  generated_at: "2026-03-25T00:00:00.000Z",
  run_date: "2026-03-25",
  todoist_overdue: [],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

describe("isMyAssistDailyContext", () => {
  it("accepts a minimal valid payload", () => {
    expect(isMyAssistDailyContext(minimalValid)).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isMyAssistDailyContext(null)).toBe(false);
    expect(isMyAssistDailyContext(undefined)).toBe(false);
    expect(isMyAssistDailyContext("x")).toBe(false);
  });

  it("rejects missing required string fields", () => {
    expect(isMyAssistDailyContext({ ...minimalValid, generated_at: 1 })).toBe(false);
    expect(isMyAssistDailyContext({ ...minimalValid, run_date: null })).toBe(false);
  });

  it("rejects non-array collections", () => {
    expect(isMyAssistDailyContext({ ...minimalValid, todoist_overdue: {} })).toBe(false);
    expect(isMyAssistDailyContext({ ...minimalValid, gmail_signals: "x" })).toBe(false);
  });

  it("allows extra keys (forward compatible)", () => {
    expect(
      isMyAssistDailyContext({
        ...minimalValid,
        source_item_counts: { gmail_messages: 1 },
      }),
    ).toBe(true);
  });
});
