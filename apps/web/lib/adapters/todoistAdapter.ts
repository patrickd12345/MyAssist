import "server-only";

import { resolveTodoistApiToken } from "@/lib/todoistToken";
import type { AdapterTodayInput, LiveProviderAdapter } from "./types";

const TODOIST_BASE_URL = "https://api.todoist.com/api/v1";

export type TodoistTask = {
  id: string;
  content: string;
  description: string;
  priority: number;
  due: { date?: string; datetime?: string; string?: string; timezone?: string } | null;
  url: string | null;
};

export type TodoistCreatePayload = {
  content: string;
  description?: string;
  dueString?: string;
  dueLang?: string;
  priority?: 1 | 2 | 3 | 4;
};

export type TodoistUpdatePayload = Partial<TodoistCreatePayload>;

function mapTask(raw: Record<string, unknown>): TodoistTask | null {
  const id = String(raw.id ?? "").trim();
  if (!id) return null;
  const dueRaw = raw.due as Record<string, unknown> | null | undefined;
  return {
    id,
    content: typeof raw.content === "string" ? raw.content : "(untitled task)",
    description: typeof raw.description === "string" ? raw.description : "",
    priority: typeof raw.priority === "number" ? raw.priority : 1,
    due: dueRaw
      ? {
          date: typeof dueRaw.date === "string" ? dueRaw.date : undefined,
          datetime: typeof dueRaw.datetime === "string" ? dueRaw.datetime : undefined,
          string: typeof dueRaw.string === "string" ? dueRaw.string : undefined,
          timezone: typeof dueRaw.timezone === "string" ? dueRaw.timezone : undefined,
        }
      : null,
    url: typeof raw.url === "string" ? raw.url : null,
  };
}

async function todoistToken(userId: string): Promise<string> {
  const token = await resolveTodoistApiToken(userId);
  if (!token?.trim()) throw new Error("todoist_not_connected");
  return token;
}

async function fetchTodoist<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${TODOIST_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`todoist_request_failed_${res.status}`);
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

export class TodoistAdapter
  implements LiveProviderAdapter<TodoistTask, TodoistTask, TodoistCreatePayload, TodoistUpdatePayload>
{
  constructor(private readonly userId: string) {}

  async getToday(input?: AdapterTodayInput): Promise<TodoistTask[]> {
    const token = await todoistToken(this.userId);
    const limit = Math.max(1, Math.min(input?.limit ?? 100, 200));
    const [overdue, today] = await Promise.all([
      fetchTodoist<Array<Record<string, unknown>>>(token, `/tasks?filter=${encodeURIComponent("overdue")}&limit=${limit}`),
      fetchTodoist<Array<Record<string, unknown>>>(token, `/tasks?filter=${encodeURIComponent("today | (overdue & !recurring)")}&limit=${limit}`),
    ]);
    const seen = new Set<string>();
    return [...overdue, ...today]
      .map(mapTask)
      .filter((task): task is TodoistTask => Boolean(task))
      .filter((task) => (seen.has(task.id) ? false : (seen.add(task.id), true)));
  }

  async getById(id: string): Promise<TodoistTask | null> {
    const taskId = id.trim();
    if (!taskId) return null;
    const token = await todoistToken(this.userId);
    return mapTask(await fetchTodoist<Record<string, unknown>>(token, `/tasks/${encodeURIComponent(taskId)}`));
  }

  async search(query: string, limit = 25): Promise<TodoistTask[]> {
    const q = query.trim();
    if (!q) return [];
    const token = await todoistToken(this.userId);
    const raw = await fetchTodoist<Array<Record<string, unknown>>>(
      token,
      `/tasks?filter=${encodeURIComponent(`search: ${q}`)}&limit=${Math.max(1, Math.min(limit, 200))}`,
    );
    return raw.map(mapTask).filter((task): task is TodoistTask => Boolean(task));
  }

  async create(payload: TodoistCreatePayload): Promise<TodoistTask> {
    const token = await todoistToken(this.userId);
    const task = mapTask(
      await fetchTodoist<Record<string, unknown>>(token, "/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: payload.content,
          ...(payload.description ? { description: payload.description } : {}),
          ...(payload.dueString ? { due_string: payload.dueString } : {}),
          ...(payload.dueLang ? { due_lang: payload.dueLang } : {}),
          ...(payload.priority ? { priority: payload.priority } : {}),
        }),
      }),
    );
    if (!task) throw new Error("todoist_create_failed");
    return task;
  }

  async update(id: string, payload: TodoistUpdatePayload): Promise<TodoistTask> {
    const taskId = id.trim();
    if (!taskId) throw new Error("todoist_invalid_task_id");
    const token = await todoistToken(this.userId);
    const task = mapTask(
      await fetchTodoist<Record<string, unknown>>(token, `/tasks/${encodeURIComponent(taskId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(payload.content ? { content: payload.content } : {}),
          ...(payload.description ? { description: payload.description } : {}),
          ...(payload.dueString ? { due_string: payload.dueString } : {}),
          ...(payload.dueLang ? { due_lang: payload.dueLang } : {}),
          ...(payload.priority ? { priority: payload.priority } : {}),
        }),
      }),
    );
    if (!task) throw new Error("todoist_update_failed");
    return task;
  }

  async complete(id: string): Promise<void> {
    const taskId = id.trim();
    if (!taskId) throw new Error("todoist_invalid_task_id");
    const token = await todoistToken(this.userId);
    await fetchTodoist<Record<string, unknown>>(token, `/tasks/${encodeURIComponent(taskId)}/close`, { method: "POST" });
  }

  /** Permanently delete a task (used for undoing MyAssist-created tasks). */
  async delete(id: string): Promise<void> {
    const taskId = id.trim();
    if (!taskId) throw new Error("todoist_invalid_task_id");
    const token = await todoistToken(this.userId);
    const res = await fetch(`${TODOIST_BASE_URL}/tasks/${encodeURIComponent(taskId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`todoist_request_failed_${res.status}`);
  }
}

export function createTodoistAdapter(userId: string): TodoistAdapter {
  return new TodoistAdapter(userId);
}
