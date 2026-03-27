import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchTodoistTaskRecordsForUser,
  nextCursorFromTodoistListJson,
  tasksFromTodoistListJson,
} from "./todoistApiTasks";
import { bucketTodoistTasksFromApi } from "./todoistTaskBuckets";

const resolveTodoistApiToken = vi.hoisted(() => vi.fn(async () => "test-token"));

vi.mock("./todoistToken", () => ({
  resolveTodoistApiToken: resolveTodoistApiToken,
}));

describe("todoistApiTasks", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses legacy raw array responses", () => {
    const json = [{ id: "a", content: "x" }];
    expect(tasksFromTodoistListJson(json)?.map((t) => t.id)).toEqual(["a"]);
  });

  it("parses paginated { results, next_cursor } (Todoist REST list shape)", () => {
    const json = {
      results: [
        { id: "t1", content: "A", priority: 1, due: { date: "2026-06-15" } },
        { id: "t2", content: "B", priority: 4 },
      ],
      next_cursor: null,
    };
    expect(tasksFromTodoistListJson(json)).toHaveLength(2);
    expect(nextCursorFromTodoistListJson(json)).toBe(null);
  });

  it("returns next_cursor when present", () => {
    expect(
      nextCursorFromTodoistListJson({
        results: [],
        next_cursor: "cursor-token",
      }),
    ).toBe("cursor-token");
  });

  it("returns null for invalid JSON shape", () => {
    expect(tasksFromTodoistListJson({ foo: 1 })).toBe(null);
  });

  it("fetches all pages and buckets Overdue/Today like live API", async () => {
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: "p1", content: "Old", priority: 1, due: { date: "2026-06-10" } }],
          next_cursor: "c1",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: "p2", content: "Today", priority: 2, due: { date: "2026-06-15" } }],
          next_cursor: null,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const tasks = await fetchTodoistTaskRecordsForUser("user-1");
    expect(tasks).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const now = new Date("2026-06-15T16:00:00.000Z");
    const buckets = bucketTodoistTasksFromApi(tasks!, { now, timeZone: "America/Toronto" });
    expect(buckets.todoist_overdue.map((t) => t.id)).toEqual(["p1"]);
    expect(buckets.todoist_due_today.map((t) => t.id)).toEqual(["p2"]);
  });

  it("returns null when the list request is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401 })));
    await expect(fetchTodoistTaskRecordsForUser("u")).resolves.toBe(null);
  });
});
