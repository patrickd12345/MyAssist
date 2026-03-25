import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyAssistDailyContext, SituationBrief } from "./types";

const contextFixture: MyAssistDailyContext = {
  generated_at: "2026-03-25T03:00:00.000Z",
  run_date: "2026-03-24",
  todoist_overdue: [{ id: "t1", content: "Renew passport", priority: 1 }],
  todoist_due_today: [],
  todoist_upcoming_high_priority: [],
  gmail_signals: [],
  calendar_today: [],
};

const briefFixture: SituationBrief = {
  pressure_summary: "Pressure is high.",
  top_priorities: ["Renew passport"],
  conflicts_and_risks: ["Deadline risk"],
  defer_recommendations: ["Defer inbox cleanup"],
  next_actions: ["Close overdue task"],
  confidence_and_limits: "Based on current context only.",
  memory_insights: [],
};

let tempDirs: string[] = [];

afterEach(async () => {
  for (const dir of tempDirs) {
    await rm(dir, { recursive: true, force: true });
  }
  tempDirs = [];
  delete process.env.MYASSIST_MEMORY_FILE;
  vi.resetModules();
});

async function createStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "myassist-memory-test-"));
  tempDirs.push(dir);
  process.env.MYASSIST_MEMORY_FILE = path.join(dir, "rolling-memory.json");
  const store = await import("./memoryStore");
  return { dir, store };
}

describe("memoryStore", () => {
  it("stores and retrieves rolling memory prompts", async () => {
    const { store } = await createStore();
    await store.storeSituationBrief(contextFixture, briefFixture);

    const prompt = await store.getRollingMemoryPrompt(contextFixture);
    const parsed = JSON.parse(prompt) as { selected_entries: Array<{ note: string }> };
    expect(parsed.selected_entries.length).toBe(1);
    expect(parsed.selected_entries[0].note).toContain("Pressure:");
  });

  it("persists feedback entries to the memory file", async () => {
    const { store } = await createStore();
    await store.storeBriefFeedback({
      run_date: "2026-03-24",
      rating: "useful",
      note: "Great prioritization",
    });

    const persistedRaw = await readFile(process.env.MYASSIST_MEMORY_FILE as string, "utf8");
    const persisted = JSON.parse(persistedRaw) as { entries: Array<{ kind: string; text: string }> };
    expect(persisted.entries.length).toBe(1);
    expect(persisted.entries[0].kind).toBe("feedback");
    expect(persisted.entries[0].text).toContain("Great prioritization");
  });
});
