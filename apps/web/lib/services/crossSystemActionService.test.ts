import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  gmailAdapterMock,
  calendarAdapterMock,
  todoistAdapterMock,
  mkdirMock,
  appendFileMock,
} = vi.hoisted(() => ({
  gmailAdapterMock: {
    getById: vi.fn(),
    archive: vi.fn(),
  },
  calendarAdapterMock: {
    create: vi.fn(),
    getToday: vi.fn(),
  },
  todoistAdapterMock: {
    create: vi.fn(),
    getById: vi.fn(),
    complete: vi.fn(),
  },
  mkdirMock: vi.fn(),
  appendFileMock: vi.fn(),
}));

vi.mock("@/lib/adapters/gmailAdapter", () => ({
  createGmailAdapter: () => gmailAdapterMock,
}));

vi.mock("@/lib/adapters/calendarAdapter", () => ({
  createCalendarAdapter: () => calendarAdapterMock,
}));

vi.mock("@/lib/adapters/todoistAdapter", () => ({
  createTodoistAdapter: () => todoistAdapterMock,
}));

vi.mock("node:fs/promises", () => ({
  mkdir: mkdirMock,
  appendFile: appendFileMock,
  default: {
    mkdir: mkdirMock,
    appendFile: appendFileMock,
  },
}));

import { createCrossSystemActionService } from "./crossSystemActionService";

describe("CrossSystemActionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gmailAdapterMock.getById.mockResolvedValue({
      id: "m1",
      threadId: "thread-1",
      from: "Alice",
      subject: "Follow up",
      snippet: "Need a task",
      date: "Fri, 26 Mar 2026 09:00:00 +0000",
      internalDate: "1714137600000",
    });
    gmailAdapterMock.archive.mockResolvedValue(undefined);
    calendarAdapterMock.getToday.mockResolvedValue([]);
    calendarAdapterMock.create.mockResolvedValue({
      id: "e1",
      summary: "Follow up",
      description: "",
      location: null,
      start: { dateTime: "2026-03-26T09:00:00.000Z" },
      end: { dateTime: "2026-03-26T09:30:00.000Z" },
      status: "confirmed",
    });
    todoistAdapterMock.create.mockResolvedValue({
      id: "t1",
      content: "Follow up",
      description: "",
      priority: 1,
      due: null,
      url: "https://todoist.com/showTask?id=1",
    });
    todoistAdapterMock.getById.mockResolvedValue({
      id: "t2",
      content: "Write report",
      description: "",
      due: { datetime: "2026-03-26T14:00:00.000Z" },
      priority: 1,
      url: null,
    });
    todoistAdapterMock.complete.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    appendFileMock.mockResolvedValue(undefined);
  });

  it("converts email to task via live providers and returns task summary and refresh hints", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.emailToTask("m1");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "email_to_task") return;
    expect(todoistAdapterMock.create).toHaveBeenCalledOnce();
    const createArg = todoistAdapterMock.create.mock.calls[0]?.[0] as { content: string; description: string };
    expect(createArg.content).toBe("Follow up");
    expect(createArg.description).toContain("mail.google.com");
    expect(result.sourceEmailId).toBe("m1");
    expect(result.taskSummary.id).toBe("t1");
    expect(result.refreshHints.providers).toEqual(["gmail", "todoist"]);
    expect(appendFileMock).toHaveBeenCalledOnce();
  });

  it("creates calendar event from email when datetime is reliable and slot is free", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.emailToEvent("m1");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "email_to_event") return;
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    expect(calendarAdapterMock.create).toHaveBeenCalledOnce();
    expect(result.eventSummary.id).toBe("e1");
    expect(result.refreshHints.providers).toEqual(["gmail", "google_calendar"]);
  });

  it("returns draft suggestion for email to event when Date header has no explicit time", async () => {
    gmailAdapterMock.getById.mockResolvedValueOnce({
      id: "m2",
      threadId: null,
      from: "Bob",
      subject: "Meet soon",
      snippet: "Let's sync",
      date: "Thu, 26 Mar 2026",
      internalDate: null,
    });

    const service = createCrossSystemActionService("user-1");
    const result = await service.emailToEvent("m2");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "email_to_event") return;
    expect(result.outcome).toBe("suggestion");
    if (result.outcome !== "suggestion") return;
    expect(result.draft.reason).toBe("insufficient_datetime");
    expect(calendarAdapterMock.create).not.toHaveBeenCalled();
    expect(result.refreshHints.providers).toEqual([]);
  });

  it("creates focus block from task when due has datetime and slot is free", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.taskToCalendarBlock("t2");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "task_to_calendar_block") return;
    expect(result.outcome).toBe("created");
    if (result.outcome !== "created") return;
    expect(calendarAdapterMock.create).toHaveBeenCalledOnce();
    expect(result.sourceTaskId).toBe("t2");
    expect(result.refreshHints.providers).toEqual(["todoist", "google_calendar"]);
  });

  it("returns suggestion when task has no due datetime", async () => {
    todoistAdapterMock.getById.mockResolvedValueOnce({
      id: "t3",
      content: "Inbox item",
      description: "",
      due: { date: "2026-03-27" },
      priority: 1,
      url: null,
    });

    const service = createCrossSystemActionService("user-1");
    const result = await service.taskToCalendarBlock("t3");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "task_to_calendar_block") return;
    expect(result.outcome).toBe("suggestion");
    if (result.outcome !== "suggestion") return;
    expect(result.draft.reason).toBe("insufficient_scheduling");
    expect(calendarAdapterMock.create).not.toHaveBeenCalled();
    expect(result.refreshHints.providers).toEqual([]);
  });

  it("creates job hunt prep tasks from email with multiple Todoist writes", async () => {
    let seq = 0;
    todoistAdapterMock.create.mockImplementation(async (payload: { content: string }) => {
      seq += 1;
      return {
        id: `tp${seq}`,
        content: payload.content,
        description: "",
        priority: 3,
        due: null,
        url: `https://todoist.com/showTask?id=prep-${seq}`,
      };
    });
    const service = createCrossSystemActionService("user-1");
    const result = await service.jobHuntPrepTasks("m1");

    expect(result.ok).toBe(true);
    if (!result.ok || result.action !== "job_hunt_prep_tasks") return;
    expect(todoistAdapterMock.create).toHaveBeenCalledTimes(5);
    expect(result.taskSummaries).toHaveLength(5);
    expect(result.refreshHints.providers).toEqual(["gmail", "todoist"]);
    expect(appendFileMock).toHaveBeenCalled();
  });

  it("archives email with direct provider write", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.archiveEmail("m1");

    expect(result.ok).toBe(true);
    expect(gmailAdapterMock.archive).toHaveBeenCalledWith("m1");
    expect(appendFileMock).toHaveBeenCalledOnce();
  });
});
