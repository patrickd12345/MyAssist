import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { MyAssistDailyContext, SituationBrief } from "./types";

type MemoryKind = "daily_brief" | "feedback" | "resolution" | "task_nudge";

type MemoryLoopCategory = "priority" | "risk" | "next_action";
type ResolutionSource = "email" | "priority" | "risk" | "next_action" | "generic";
type ResolutionFeedback = "useful_action" | "junk" | "neutral";

type MemoryLoop = {
  category: MemoryLoopCategory;
  text: string;
  normalized: string;
};

type TaskNudge = {
  taskId: string;
  direction: "up" | "down";
  taskText: string;
};

type MemoryEntry = {
  id: string;
  kind: MemoryKind;
  run_date: string;
  created_at: string;
  text: string;
  loops?: MemoryLoop[];
  nudge?: TaskNudge;
  resolved?: {
    source: ResolutionSource;
    normalized: string;
    feedback?: ResolutionFeedback;
  };
};

type MemoryState = {
  updated_at: string;
  entries: MemoryEntry[];
};

const MAX_ENTRIES = 240;

const stateCache = new Map<string, MemoryState>();

function sanitizeUserId(userId: string): string {
  const t = userId.trim();
  if (!t) return "_anonymous";
  return t.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

export function resolveMemoryFilePath(userId: string): string {
  const safe = sanitizeUserId(userId);
  const legacy = process.env.MYASSIST_MEMORY_FILE?.trim();
  if (legacy) {
    const resolved = path.resolve(legacy);
    return path.join(path.dirname(resolved), safe, path.basename(resolved));
  }
  return path.join(process.cwd(), ".myassist-memory", "users", safe, "rolling-memory.json");
}

function emptyState(): MemoryState {
  return {
    updated_at: new Date().toISOString(),
    entries: [],
  };
}

function isMemoryLoop(value: unknown): value is MemoryLoop {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<MemoryLoop>;
  return (
    (item.category === "priority" || item.category === "risk" || item.category === "next_action") &&
    typeof item.text === "string" &&
    typeof item.normalized === "string"
  );
}

async function loadState(userId: string): Promise<MemoryState> {
  const file = resolveMemoryFilePath(userId);
  if (stateCache.has(file)) {
    return stateCache.get(file) as MemoryState;
  }
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<MemoryState>;
    if (!parsed || !Array.isArray(parsed.entries)) {
      const fresh = emptyState();
      stateCache.set(file, fresh);
      return fresh;
    }
    const state: MemoryState = {
      updated_at: typeof parsed.updated_at === "string" ? parsed.updated_at : new Date().toISOString(),
      entries: parsed.entries.filter((entry): entry is MemoryEntry => {
        if (!entry || typeof entry !== "object") return false;
        const e = entry as Partial<MemoryEntry>;
        return (
          typeof e.id === "string" &&
          (e.kind === "daily_brief" || e.kind === "feedback" || e.kind === "resolution" || e.kind === "task_nudge") &&
          typeof e.run_date === "string" &&
          typeof e.created_at === "string" &&
          typeof e.text === "string"
        );
      }).map((entry) => ({
        ...entry,
        loops: Array.isArray(entry.loops) ? entry.loops.filter(isMemoryLoop) : undefined,
        nudge:
          entry.nudge &&
          typeof entry.nudge === "object" &&
          typeof (entry.nudge as TaskNudge).taskId === "string" &&
          ((entry.nudge as TaskNudge).direction === "up" || (entry.nudge as TaskNudge).direction === "down") &&
          typeof (entry.nudge as TaskNudge).taskText === "string"
            ? (entry.nudge as TaskNudge)
            : undefined,
        resolved:
          entry.resolved &&
          typeof entry.resolved === "object" &&
          (entry.resolved.source === "email" ||
            entry.resolved.source === "priority" ||
            entry.resolved.source === "risk" ||
            entry.resolved.source === "next_action" ||
            entry.resolved.source === "generic") &&
          typeof entry.resolved.normalized === "string"
            ? {
                source: entry.resolved.source,
                normalized: entry.resolved.normalized,
                feedback: parseStoredResolutionFeedback(
                  (entry.resolved as { feedback?: unknown }).feedback,
                ),
              }
            : undefined,
      })),
    };
    stateCache.set(file, state);
    return state;
  } catch {
    const fresh = emptyState();
    stateCache.set(file, fresh);
    return fresh;
  }
}

async function persistState(userId: string, state: MemoryState): Promise<void> {
  const file = resolveMemoryFilePath(userId);
  await mkdir(path.dirname(file), { recursive: true });
  state.updated_at = new Date().toISOString();
  await writeFile(file, JSON.stringify(state, null, 2), "utf8");
  stateCache.set(file, state);
}

function parseStoredResolutionFeedback(value: unknown): ResolutionFeedback | undefined {
  if (value === "junk" || value === "useful_action" || value === "neutral") return value;
  return undefined;
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLoopKey(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/["'`]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLoops(brief: SituationBrief): MemoryLoop[] {
  const seed: Array<{ category: MemoryLoopCategory; items: string[] }> = [
    { category: "priority", items: brief.top_priorities },
    { category: "risk", items: brief.conflicts_and_risks },
    { category: "next_action", items: brief.next_actions },
  ];
  const seen = new Set<string>();
  const loops: MemoryLoop[] = [];

  for (const group of seed) {
    for (const item of group.items) {
      const text = normalizeText(item);
      if (!text) continue;
      const normalized = normalizeLoopKey(text);
      if (!normalized || seen.has(`${group.category}:${normalized}`)) continue;
      seen.add(`${group.category}:${normalized}`);
      loops.push({
        category: group.category,
        text,
        normalized,
      });
    }
  }

  return loops.slice(0, 14);
}

function scoreEntry(entry: MemoryEntry, context: MyAssistDailyContext): number {
  const now = Date.now();
  const created = new Date(entry.created_at).getTime();
  const ageHours = Number.isFinite(created) ? Math.max(0, (now - created) / 36e5) : 9999;
  const recencyScore = Math.max(0, 72 - ageHours);
  const taskSeed = context.todoist_overdue[0];
  const topTask = typeof taskSeed?.content === "string" ? taskSeed.content.toLowerCase() : "";
  const lexicalBoost = topTask && entry.text.toLowerCase().includes(topTask) ? 18 : 0;
  const kindBoost = entry.kind === "feedback" ? 12 : entry.kind === "resolution" ? 10 : 6;
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

function scoreLoop(loop: MemoryLoop, mentionCount: number, lastSeenAt: string, context: MyAssistDailyContext): number {
  const now = Date.now();
  const seen = new Date(lastSeenAt).getTime();
  const ageHours = Number.isFinite(seen) ? Math.max(0, (now - seen) / 36e5) : 9999;
  const recencyScore = Math.max(0, 96 - ageHours);
  const repeatBoost = Math.min(mentionCount, 4) * 12;
  const taskSeed = context.todoist_overdue[0];
  const topTask = typeof taskSeed?.content === "string" ? normalizeLoopKey(taskSeed.content) : "";
  const lexicalBoost = topTask && loop.normalized.includes(topTask) ? 20 : 0;
  const categoryBoost =
    loop.category === "priority" ? 10 : loop.category === "risk" ? 8 : 6;
  return recencyScore + repeatBoost + lexicalBoost + categoryBoost;
}

export async function getRollingMemoryPrompt(userId: string, context: MyAssistDailyContext): Promise<string> {
  const state = await loadState(userId);
  if (state.entries.length === 0) {
    return "No stored memory yet. Build a clean baseline from this run.";
  }
  const selected = [...state.entries]
    .filter(entry => entry.kind !== "task_nudge")
    .sort((a, b) => scoreEntry(b, context) - scoreEntry(a, context))
    .slice(0, 14)
    .map((entry) => ({
      kind: entry.kind,
      run_date: entry.run_date,
      note: entry.text,
    }));

  const recentNudges = [...state.entries]
    .filter(entry => entry.kind === "task_nudge")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10)
    .map((entry) => ({
      action: entry.nudge?.direction === "up" ? "Preferred" : "Deferred",
      task: entry.nudge?.taskText,
      date: entry.run_date,
    }));

  const aggregated = new Map<
    string,
    { loop: MemoryLoop; mention_count: number; first_seen: string; last_seen: string }
  >();

  for (const entry of state.entries) {
    if (entry.kind !== "daily_brief" || !entry.loops?.length) continue;
    for (const loop of entry.loops) {
      const key = `${loop.category}:${loop.normalized}`;
      const existing = aggregated.get(key);
      if (!existing) {
        aggregated.set(key, {
          loop,
          mention_count: 1,
          first_seen: entry.run_date,
          last_seen: entry.run_date,
        });
        continue;
      }
      existing.mention_count += 1;
      if (entry.run_date < existing.first_seen) existing.first_seen = entry.run_date;
      if (entry.run_date > existing.last_seen) existing.last_seen = entry.run_date;
    }
  }

  const carryForward = [...aggregated.values()]
    .sort(
      (a, b) =>
        scoreLoop(b.loop, b.mention_count, b.last_seen, context) -
        scoreLoop(a.loop, a.mention_count, a.last_seen, context),
    )
    .slice(0, 8)
    .map((item) => ({
      category: item.loop.category,
      text: item.loop.text,
      mention_count: item.mention_count,
      first_seen: item.first_seen,
      last_seen: item.last_seen,
    }));

  const resolvedItems = getResolvedItemsFromState(state).slice(0, 12);

  return JSON.stringify(
    {
      policy: "Rolling memory: use as context, not as source of truth over current snapshot. Pay attention to repeated unresolved loops and follow through when they persist. Consider 'task_nudge' entries as explicit user feedback about priority preferences.",
      selected_entries: selected,
      recent_task_nudges: recentNudges,
      carry_forward_loops: carryForward,
      resolved_items: resolvedItems,
    },
    null,
    2,
  );
}

function getResolvedItemsFromState(state: MemoryState): Array<{
  source: ResolutionSource;
  text: string;
  normalized: string;
  resolved_at: string;
  run_date: string;
  feedback?: ResolutionFeedback;
}> {
  const latest = new Map<
    string,
    {
      source: ResolutionSource;
      text: string;
      normalized: string;
      resolved_at: string;
      run_date: string;
      feedback?: ResolutionFeedback;
    }
  >();
  for (const entry of state.entries) {
    if (entry.kind !== "resolution" || !entry.resolved) continue;
    const key = `${entry.resolved.source}:${entry.resolved.normalized}`;
    const current = latest.get(key);
    if (!current || entry.created_at > current.resolved_at) {
      latest.set(key, {
        source: entry.resolved.source,
        text: entry.text,
        normalized: entry.resolved.normalized,
        resolved_at: entry.created_at,
        run_date: entry.run_date,
        feedback: entry.resolved.feedback,
      });
    }
  }
  return [...latest.values()].sort((a, b) => b.resolved_at.localeCompare(a.resolved_at));
}

export async function getResolvedItems(userId: string): Promise<
  Array<{
    source: ResolutionSource;
    text: string;
    normalized: string;
    resolved_at: string;
    run_date: string;
    feedback?: ResolutionFeedback;
  }>
> {
  const state = await loadState(userId);
  return getResolvedItemsFromState(state);
}

/** Subjects / labels the user previously marked as junk vs real handled mail — for email ranking prompts. */
export async function getEmailTriageHints(userId: string): Promise<{
  junk: string[];
  useful: string[];
}> {
  const state = await loadState(userId);
  const latest = new Map<
    string,
    { feedback?: ResolutionFeedback; created_at: string; text: string }
  >();
  for (const entry of state.entries) {
    if (entry.kind !== "resolution" || entry.resolved?.source !== "email") continue;
    const key = entry.resolved.normalized;
    const cur = latest.get(key);
    if (!cur || entry.created_at > cur.created_at) {
      latest.set(key, {
        feedback: entry.resolved.feedback,
        created_at: entry.created_at,
        text: entry.text,
      });
    }
  }
  const junk: string[] = [];
  const useful: string[] = [];
  for (const v of latest.values()) {
    const fb = v.feedback ?? "useful_action";
    if (fb === "junk") junk.push(v.text);
    else if (fb === "useful_action") useful.push(v.text);
  }
  return {
    junk: junk.slice(0, 32),
    useful: useful.slice(0, 32),
  };
}

export async function storeSituationBrief(
  userId: string,
  context: MyAssistDailyContext,
  brief: SituationBrief,
): Promise<{ entries: number }> {
  const state = await loadState(userId);
  const id = `brief:${context.run_date}`;
  const text = toTextBrief(brief);
  const loops = extractLoops(brief);
  const nextEntries = state.entries.filter((entry) => entry.id !== id);
  nextEntries.push({
    id,
    kind: "daily_brief",
    run_date: context.run_date,
    created_at: new Date().toISOString(),
    text,
    loops,
  });
  while (nextEntries.length > MAX_ENTRIES) {
    nextEntries.shift();
  }
  await persistState(userId, { ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}

export async function storeBriefFeedback(
  userId: string,
  input: {
    run_date: string;
    rating: "useful" | "needs_work";
    note?: string;
  },
): Promise<{ entries: number }> {
  const state = await loadState(userId);
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
  await persistState(userId, { ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}

export async function storeResolvedItem(
  userId: string,
  input: {
    text: string;
    source: ResolutionSource;
    run_date: string;
    feedback?: ResolutionFeedback;
  },
): Promise<{ entries: number }> {
  const state = await loadState(userId);
  const text = normalizeText(input.text);
  const normalized = normalizeLoopKey(text);
  if (!text || !normalized) {
    throw new Error("Resolved item text is required.");
  }
  const feedback: ResolutionFeedback =
    input.feedback === "junk" || input.feedback === "useful_action" || input.feedback === "neutral"
      ? input.feedback
      : "useful_action";
  const label =
    feedback === "junk"
      ? `Dismissed as junk (low priority): ${text}`
      : `Handled / acknowledged: ${text}`;
  const createdAt = new Date().toISOString();
  const nextEntries = state.entries.concat({
    id: `resolution:${input.source}:${normalized}:${createdAt}`,
    kind: "resolution",
    run_date: input.run_date,
    created_at: createdAt,
    text: label,
    resolved: {
      source: input.source,
      normalized,
      feedback,
    },
  });
  while (nextEntries.length > MAX_ENTRIES) {
    nextEntries.shift();
  }
  await persistState(userId, { ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}

export async function storeTaskNudge(
  userId: string,
  input: {
    run_date: string;
    taskId: string;
    direction: "up" | "down";
    taskText: string;
  },
): Promise<{ entries: number }> {
  const state = await loadState(userId);
  const createdAt = new Date().toISOString();
  
  // We only keep the latest nudge per task to avoid contradictory stacking
  const filteredEntries = state.entries.filter(e => !(e.kind === "task_nudge" && e.nudge?.taskId === input.taskId));
  
  const text = `User nudged task ${input.direction}: ${input.taskText}`;
  
  const nextEntries = filteredEntries.concat({
    id: `nudge:${input.taskId}:${createdAt}`,
    kind: "task_nudge",
    run_date: input.run_date,
    created_at: createdAt,
    text,
    nudge: {
      taskId: input.taskId,
      direction: input.direction,
      taskText: input.taskText,
    },
  });
  
  while (nextEntries.length > MAX_ENTRIES) {
    nextEntries.shift();
  }
  
  await persistState(userId, { ...state, entries: nextEntries });
  return { entries: nextEntries.length };
}

export async function getTaskNudges(userId: string): Promise<Record<string, "up" | "down">> {
  const state = await loadState(userId);
  const nudges: Record<string, "up" | "down"> = {};
  
  for (const entry of state.entries) {
    if (entry.kind === "task_nudge" && entry.nudge) {
      nudges[entry.nudge.taskId] = entry.nudge.direction;
    }
  }
  
  return nudges;
}
