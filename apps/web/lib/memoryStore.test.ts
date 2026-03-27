import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MyAssistDailyContext, SituationBrief } from "./types";

const USER = "memtest";

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

function memoryFileForUser(baseDir: string): string {
  return path.join(baseDir, USER, "rolling-memory.json");
}

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
    await store.storeSituationBrief(USER, contextFixture, briefFixture);

    const prompt = await store.getRollingMemoryPrompt(USER, contextFixture);
    const parsed = JSON.parse(prompt) as {
      selected_entries: Array<{ note: string }>;
      carry_forward_loops: Array<{ text: string; category: string }>;
    };
    expect(parsed.selected_entries.length).toBe(1);
    expect(parsed.selected_entries[0].note).toContain("Pressure:");
    expect(parsed.carry_forward_loops.length).toBeGreaterThan(0);
    expect(parsed.carry_forward_loops[0].text).toContain("Renew passport");
  });

  it("persists feedback entries to the memory file", async () => {
    const { dir, store } = await createStore();
    await store.storeBriefFeedback(USER, {
      run_date: "2026-03-24",
      rating: "useful",
      note: "Great prioritization",
    });

    const persistedRaw = await readFile(memoryFileForUser(dir), "utf8");
    const persisted = JSON.parse(persistedRaw) as { entries: Array<{ kind: string; text: string }> };
    expect(persisted.entries.length).toBe(1);
    expect(persisted.entries[0].kind).toBe("feedback");
    expect(persisted.entries[0].text).toContain("Great prioritization");
  });

  it("persists resolved items and returns them in memory status", async () => {
    const { store } = await createStore();
    await store.storeResolvedItem(USER, {
      run_date: "2026-03-24",
      source: "email",
      text: "Cancel Monarch trial before renewal",
    });

    const resolved = await store.getResolvedItems(USER);
    expect(resolved.length).toBe(1);
    expect(resolved[0].source).toBe("email");
    expect(resolved[0].text).toContain("Monarch");
    expect(resolved[0].text).toContain("Handled");
    expect(resolved[0].feedback).toBe("useful_action");
  });

  it("persists junk feedback on resolved email items", async () => {
    const { store } = await createStore();
    await store.storeResolvedItem(USER, {
      run_date: "2026-03-24",
      source: "email",
      text: "Newsletter you never read",
      feedback: "junk",
    });

    const resolved = await store.getResolvedItems(USER);
    expect(resolved.length).toBe(1);
    expect(resolved[0].feedback).toBe("junk");
    expect(resolved[0].text).toContain("Dismissed");

    const hints = await store.getEmailTriageHints(USER);
    expect(hints.junk.length).toBe(1);
    expect(hints.useful.length).toBe(0);
  });

  it("tracks repeated loops across multiple brief runs", async () => {
    const { store } = await createStore();
    await store.storeSituationBrief(USER, contextFixture, briefFixture);
    await store.storeSituationBrief(
      USER,
      {
        ...contextFixture,
        run_date: "2026-03-25",
        generated_at: "2026-03-26T03:00:00.000Z",
      },
      {
        ...briefFixture,
        top_priorities: ["Renew passport", "Cancel Monarch trial before charge"],
      },
    );

    const prompt = await store.getRollingMemoryPrompt(USER, contextFixture);
    const parsed = JSON.parse(prompt) as {
      carry_forward_loops: Array<{ text: string; mention_count: number }>;
    };
    const passport = parsed.carry_forward_loops.find((item) => item.text === "Renew passport");
    expect(passport).toBeDefined();
    expect(passport?.mention_count).toBe(2);
  });

  it("isolates rolling memory per user", async () => {
    const { store } = await createStore();
    await store.storeSituationBrief("user-a", contextFixture, {
      ...briefFixture,
      pressure_summary: "User A only",
    });
    await store.storeSituationBrief("user-b", contextFixture, {
      ...briefFixture,
      pressure_summary: "User B only",
    });

    const promptA = await store.getRollingMemoryPrompt("user-a", contextFixture);
    const promptB = await store.getRollingMemoryPrompt("user-b", contextFixture);
    expect(promptA).toContain("User A only");
    expect(promptB).toContain("User B only");
    expect(promptA).not.toContain("User B only");
    expect(promptB).not.toContain("User A only");
  });
});
