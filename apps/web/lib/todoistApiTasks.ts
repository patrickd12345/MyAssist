import "server-only";

import { resolveTodoistApiToken } from "./todoistToken";

const TODOIST_TASKS_LIST_URL = "https://api.todoist.com/api/v1/tasks";

const TODOIST_PAGE_LIMIT = 100;
const MAX_TASK_PAGES = 3;
const MAX_TOTAL_TASKS = 250;

/**
 * Todoist GET /api/v1/tasks returns paginated JSON `{ results: Task[], next_cursor: string | null }`.
 * Legacy integrations may still see a raw array; accept both.
 */
export function tasksFromTodoistListJson(json: unknown): Record<string, unknown>[] | null {
  if (Array.isArray(json)) {
    return json.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
  }
  if (json && typeof json === "object" && "results" in json) {
    const results = (json as { results?: unknown }).results;
    if (Array.isArray(results)) {
      return results.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"));
    }
  }
  return null;
}

export function nextCursorFromTodoistListJson(json: unknown): string | null {
  if (!json || typeof json !== "object" || !("next_cursor" in json)) return null;
  const c = (json as { next_cursor?: unknown }).next_cursor;
  if (typeof c !== "string" || c.length === 0) return null;
  return c;
}

/**
 * Fetches all active tasks (paginated) for bucketing and adapters.
 */
export async function fetchTodoistTaskRecordsForUser(userId: string): Promise<Record<string, unknown>[] | null> {
  const token = await resolveTodoistApiToken(userId);
  if (!token) return null;

  const all: Record<string, unknown>[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_TASK_PAGES; page++) {
    const url = new URL(TODOIST_TASKS_LIST_URL);
    url.searchParams.set("limit", String(TODOIST_PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as unknown;
    const slice = tasksFromTodoistListJson(json);
    if (slice === null) return null;
    all.push(...slice);
    if (all.length >= MAX_TOTAL_TASKS) break;

    const next = nextCursorFromTodoistListJson(json);
    if (!next) break;
    cursor = next;
  }

  return all.slice(0, MAX_TOTAL_TASKS);
}
