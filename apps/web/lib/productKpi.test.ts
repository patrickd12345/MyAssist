import { describe, expect, it, vi, beforeEach } from "vitest";
import { logKpiDailyContextServed, logKpiProviderAction, logKpiMcpDailyContext } from "./productKpi";
import * as serverLog from "./serverLog";

vi.mock("./serverLog", () => ({
  logServerEvent: vi.fn(),
}));

describe("productKpi", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logKpiProviderAction", () => {
    it("logs action without status", () => {
      logKpiProviderAction({
        provider: "todoist",
        action: "test_action",
        ok: true,
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_provider_action",
        {
          provider: "todoist",
          action: "test_action",
          ok: true,
        }
      );
    });

    it("logs action with status", () => {
      logKpiProviderAction({
        provider: "gmail",
        action: "read",
        ok: false,
        status: 403,
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_provider_action",
        {
          provider: "gmail",
          action: "read",
          ok: false,
          http_status: 403,
        }
      );
    });

    it("logs action with all different providers", () => {
      logKpiProviderAction({
        provider: "google_calendar",
        action: "sync",
        ok: true,
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_provider_action",
        {
          provider: "google_calendar",
          action: "sync",
          ok: true,
        }
      );

      logKpiProviderAction({
        provider: "cross_system",
        action: "analyze",
        ok: true,
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_provider_action",
        {
          provider: "cross_system",
          action: "analyze",
          ok: true,
        }
      );
    });
  });

  describe("logKpiDailyContextServed", () => {
    it("logs daily context served event", () => {
      logKpiDailyContextServed({
        source: "test_source",
        duration_ms: 150,
        path: "session",
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_daily_context_served",
        {
          context_source: "test_source",
          duration_ms: 150,
          path: "session",
        }
      );
    });
  });

  describe("logKpiMcpDailyContext", () => {
    it("logs mcp daily context event", () => {
      logKpiMcpDailyContext({
        duration_ms: 200,
        ok: true,
      });

      expect(serverLog.logServerEvent).toHaveBeenCalledWith(
        "info",
        "myassist_kpi_mcp_daily_context",
        {
          duration_ms: 200,
          ok: true,
        }
      );
    });
  });
});
