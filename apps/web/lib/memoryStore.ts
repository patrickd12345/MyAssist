import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MyAssistDailyContext, SituationBrief } from "./types";

type MemoryKind = "daily_brief" | "feedback";

type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  run_date: string;
  created_at: string;
  text: string;
};

type MemoryState = {
  updated_at: string;
  entries: MemoryEntry[];
};

const MAX_ENTRIES = 240;
const MEMORY_FILE = process.env.MYASSIST_MEMORY_FILE?.trim()
  ? path.resolve(process.env.MYASSIST_MEMORY_FILE)
  : path.join(process.cwd(), ".myassist-memory", "rolling-memory.json");

let stateCache: MemoryState | null = null;

function emptyState(): MemoryState {
  return {
    updated_at: new Date().toISOString(),
    entries: [],
  };
}

async function loadState(): Promise<MemoryState> {
  if (stateCache) return stateCache;
  try {
    const raw = await readFile(MEMORY_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    if (!parsed || !Array.isArray(parsed.entries)) {
      stateCache = emptyState();
      return stateCache;
    }
    stateCache = {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      entries: parsed.entries.filter((entry): entry is MemoryEntry => {
        if (!entry || typeof entry !== "object") return false;
        const e = entry as Partial<MemoryEntry>;
        return (
          typeof e.id === "string" &&
          (e.kind === "daily_brief" || e.kind === "feedback") &&
          typeof e.run_date === "string" &&
          typeof e.created_at === "string" &&
          typeof e.text === "string"
        );
      }),
    };
    return stateCache;
  } catch {
    stateCache = emptyState();
    return stateCache;
  }
}

async function persistState(state: MemoryState): Promise<void> {
  await mkdir(path.dirname(MEMORY_FILE), { recursive: true });
  state.updated_at = new Date().toISOString();
  await writeFile(MEMORY_FILE, JSON.stringify(state, null, 2), "utf8");
  stateCache = state;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function scoreEntry(entry: MemoryEntry, context: MyAssistDailyContext): number {
  const now = Date.now();
  const created = new Date(entry.created_at).getTime();
  const ageHours = Number.isFinite(created) ? Math.max(0, (now - created) / 36e5) : 9999;
  const recencyScore = Math.max(0, 72 - ageHours);
  const taskSeed = context.todoist_overdue[0];
  const topTask = typeof taskSeed?.content === "string" ? taskSeed.content.toLowerCase() : "";
  const lexicalBoost = topTask && entry.text.toLowerCase().includes(topTask) ? 18 : 0;
  const kindBoost = entry.kind === "feedback" ? 12 : 6;
  return recencyScore + lexicalBoost + kindBoost;
}

function toTextBrief(brief: SituationBrief): string {
  return normalizeText(
    [
      `Pressure: ${brief.pressure_summary}`,
      `Top: ${brief.top_priorities.join(" | ")}`,
      `Risks: ${brief.conflicts_and_risks.join(" | ")}`,
      `Defer: ${brief.defer_recommendations.join(" | ")}`,
      `Next: ${brief.next_actions.join(" | ")}`,
      `Limits: ${brief.confidence_and_limits}`,
    ].join(" "),
  );
}

export async function getRollingMemoryPrompt(context: MyAssistDailyContext): Promise<string> {
  const state = await loadState();
  if (state.entries.length === 0) {
    return "No stored memory yet. Build a clean baseline from this run.";
  }
  const selected = [...state.entries]
    .sort((a, b) => scoreEntry(b, context) - scoreEntry(a, context))
    .slice(0, 14)
    .map((entry) => ({
      kind: entry.kind,
      run_date: entry.run_date,
      note: entry.text,
    }));
  return JSON.stringify(
    {
      policy: "Rolling memory: use as context, not as source of truth over current snapshot.",
      selected_entries: selected,
    },
    null,
    2,
  );
}

export async function storeSituationBrief(
  context: MyAssistDailyContext,
  brief: SituationBrief,
): Promise<{ entries: number }> {
  const state = await loadState();
  const id = `brief:${context.run_date}`;
  const text = toTextBrief(brief);
  const nextEntries = state.entries.filter((entry) => entry.id !== id);
  nextEntries.push({
    id,
    kind: "daily_brief",
    run_date: context.run_date,
    created_at: new Date().toISOString(),
    text,
  });
  while (nextEntries.length > MAX_ENTRIES) {
    nextEntries.shift();
  }
  await persistState({ ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}

export async function storeBriefFeedback(input: {
  run_date: string;
  rating: "useful" | "needs_work";
  note?: string;
}): Promise<{ entries: number }> {
  const state = await loadState();
  const createdAt = new Date().toISOString();
  const text = normalizeText(
    input.note && input.note.trim() !== ""
      ? `Feedback ${input.rating} on ${input.run_date}: ${input.note.trim()}`
      : `Feedback ${input.rating} on ${input.run_date}`,
  );
  const nextEntries = state.entries.concat({
    id: `feedback:${input.run_date}:${createdAt}`,
    kind: "feedback",
    run_date: input.run_date,
    created_at: createdAt,
    text,
  });
  while (nextEntries.length > MAX_ENTRIES) {
    nextEntries.shift();
  }
  await persistState({ ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}
