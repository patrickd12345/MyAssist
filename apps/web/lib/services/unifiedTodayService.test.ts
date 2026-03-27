import { describe, expect, it } from "vitest";
import { UnifiedTodayService } from "./unifiedTodayService";

describe("UnifiedTodayService", () => {
  it("normalizes live provider reads into unified arrays and summary", async () => {
    const service = new UnifiedTodayService({
      gmail: {
        getToday: async () => [
          {
            id: "m1",
            threadId: "t1",
            from: "Alice <a@example.com>",
            subject: "Kickoff",
            date: "2026-03-26T09:00:00.000Z",
            snippet: "Agenda attached",
            internalDate: "2026-03-26T09:00:00.000Z",
            labelIds: ["INBOX"],
          },
        ],
      } as never,
      calendar: {
        getToday: async () => [
          {
            id: "e1",
            summary: "Design review",
            description: "",
            location: "Room A",
            start: { dateTime: "2026-03-26T11:00:00.000Z" },
            end: { dateTime: "2026-03-26T11:30:00.000Z" },
            status: "confirmed",
          },
        ],
      } as never,
      todoist: {
        getToday: async () => [
          {
            id: "t1",
            content: "Ship docs",
            description: "Draft and proofread",
            priority: 4,
            due: { date: "2026-03-26" },
            url: "https://todoist.com/showTask?id=t1",
          },
        ],
      } as never,
    });

    const result = await service.getToday();
    expect(result.emails).toHaveLength(1);
    expect(result.events).toHaveLength(1);
    expect(result.tasks).toHaveLength(1);
    expect(result.summary.total).toBe(3);
    expect(result.summary.providerStatus).toEqual({
      gmail: "ok",
      google_calendar: "ok",
      todoist: "ok",
    });
  });

  it("keeps working when one provider read fails", async () => {
    const service = new UnifiedTodayService({
      gmail: { getToday: async () => { throw new Error("gmail_down"); } } as never,
      calendar: { getToday: async () => [] } as never,
      todoist: { getToday: async () => [] } as never,
    });

    const result = await service.getToday();
    expect(result.emails).toEqual([]);
    expect(result.summary.providerStatus.gmail).toBe("error");
    expect(result.summary.total).toBe(0);
  });
});
