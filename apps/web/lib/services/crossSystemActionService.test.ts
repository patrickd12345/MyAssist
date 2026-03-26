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
      from: "Alice",
      subject: "Follow up",
      snippet: "Need a task",
      date: "2026-03-26T09:00:00.000Z",
    });
    gmailAdapterMock.archive.mockResolvedValue(undefined);
    calendarAdapterMock.create.mockResolvedValue({ id: "e1" });
    todoistAdapterMock.create.mockResolvedValue({ id: "t1" });
    todoistAdapterMock.getById.mockResolvedValue({
      id: "t2",
      content: "Write report",
      description: "",
      due: { datetime: "2026-03-26T14:00:00.000Z" },
    });
    todoistAdapterMock.complete.mockResolvedValue(undefined);
    mkdirMock.mockResolvedValue(undefined);
    appendFileMock.mockResolvedValue(undefined);
  });

  it("converts email to task via live providers and returns refresh hints", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.emailToTask("m1");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(todoistAdapterMock.create).toHaveBeenCalledOnce();
    expect(result.refreshHints.providers).toEqual(["gmail", "todoist"]);
    expect(appendFileMock).toHaveBeenCalledOnce();
  });

  it("archives email with direct provider write", async () => {
    const service = createCrossSystemActionService("user-1");
    const result = await service.archiveEmail("m1");

    expect(result.ok).toBe(true);
    expect(gmailAdapterMock.archive).toHaveBeenCalledWith("m1");
    expect(appendFileMock).toHaveBeenCalledOnce();
  });
});
