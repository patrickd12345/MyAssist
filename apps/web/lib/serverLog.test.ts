import { vi, describe, it, expect, beforeEach } from "vitest";
import { logAiServerEvent, logServerEvent, getServerRequestId } from "./serverLog";
import { emitAiLog, emitStructuredLog, getRequestId } from "@bookiji-inc/observability";

vi.mock("@bookiji-inc/observability", () => ({
  emitAiLog: vi.fn(),
  emitStructuredLog: vi.fn(),
  getRequestId: vi.fn(),
}));

describe("serverLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("logAiServerEvent", () => {
    it("calls emitAiLog with all provided arguments", () => {
      const metadata = { provider: "openai", model: "gpt-4", latencyMs: 1200 };
      const fields = { promptLength: 100 };

      logAiServerEvent("test_ai_event", metadata, fields);

      expect(emitAiLog).toHaveBeenCalledTimes(1);
      expect(emitAiLog).toHaveBeenCalledWith("info", "test_ai_event", metadata, fields);
    });

    it("calls emitAiLog with empty fields object when fields are omitted", () => {
      const metadata = { provider: "openai" };

      logAiServerEvent("test_ai_event", metadata);

      expect(emitAiLog).toHaveBeenCalledTimes(1);
      expect(emitAiLog).toHaveBeenCalledWith("info", "test_ai_event", metadata, {});
    });
  });

  describe("logServerEvent", () => {
    it("calls emitStructuredLog with provided arguments", () => {
      const fields = { userId: "user-1" };

      logServerEvent("warn", "test_event", fields);

      expect(emitStructuredLog).toHaveBeenCalledTimes(1);
      expect(emitStructuredLog).toHaveBeenCalledWith("warn", "test_event", fields);
    });

    it("calls emitStructuredLog with empty fields object when fields are omitted", () => {
      logServerEvent("error", "test_error");

      expect(emitStructuredLog).toHaveBeenCalledTimes(1);
      expect(emitStructuredLog).toHaveBeenCalledWith("error", "test_error", {});
    });
  });

  describe("getServerRequestId", () => {
    it("delegates to getRequestId from observability package", () => {
      vi.mocked(getRequestId).mockReturnValue("mock-req-id");

      const source = "req-source";
      const result = getServerRequestId(source);

      expect(getRequestId).toHaveBeenCalledTimes(1);
      expect(getRequestId).toHaveBeenCalledWith(source);
      expect(result).toBe("mock-req-id");
    });
  });
});
