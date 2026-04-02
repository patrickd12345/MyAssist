import { afterEach, describe, expect, it } from "vitest";
import {
  getAutoRefreshStaleMs,
  hasAnyConnectedIntegration,
  isDailyContextStale,
} from "./dailyContextAutoRefresh";

describe("dailyContextAutoRefresh", () => {
  describe("getAutoRefreshStaleMs", () => {
    afterEach(() => {
      delete process.env.NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS;
    });

    it("returns default when env unset", () => {
      expect(getAutoRefreshStaleMs()).toBe(10 * 60 * 1000);
    });

    it("parses env when valid", () => {
      process.env.NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS = "300000";
      expect(getAutoRefreshStaleMs()).toBe(300_000);
    });

    it("falls back when env too small", () => {
      process.env.NEXT_PUBLIC_MYASSIST_AUTO_REFRESH_STALE_MS = "1000";
      expect(getAutoRefreshStaleMs()).toBe(10 * 60 * 1000);
    });
  });

  describe("isDailyContextStale", () => {
    const base = new Date("2026-04-02T12:00:00.000Z").getTime();

    it("returns true when context is null", () => {
      expect(isDailyContextStale(null, base + 60_000, 10_000)).toBe(true);
    });

    it("returns false when within stale window", () => {
      expect(
        isDailyContextStale({ generated_at: "2026-04-02T12:00:00.000Z" }, base + 60_000, 120_000),
      ).toBe(false);
    });

    it("returns true when older than stale window", () => {
      expect(
        isDailyContextStale({ generated_at: "2026-04-02T12:00:00.000Z" }, base + 200_000, 120_000),
      ).toBe(true);
    });
  });

  describe("hasAnyConnectedIntegration", () => {
    it("returns false for empty", () => {
      expect(hasAnyConnectedIntegration([])).toBe(false);
    });

    it("returns true when any connected", () => {
      expect(
        hasAnyConnectedIntegration([
          { provider: "gmail", status: "disconnected" },
          { provider: "todoist", status: "connected" },
        ]),
      ).toBe(true);
    });
  });
});
