import { afterEach, describe, expect, it } from "vitest";
import { resolveMcpUserFromClientList } from "./mcpClientEntries";

describe("mcpClientEntries", () => {
  afterEach(() => {
    delete process.env.MYASSIST_MCP_CLIENTS_JSON;
    delete process.env.MYASSIST_MCP_CLIENTS_FILE;
  });

  it("returns legacy when multi-client config is not set", () => {
    expect(resolveMcpUserFromClientList("any-token")).toBe("legacy");
  });

  it("returns legacy when JSON is an empty array", () => {
    process.env.MYASSIST_MCP_CLIENTS_JSON = "[]";
    expect(resolveMcpUserFromClientList("tok")).toBe("legacy");
  });

  it("resolves matching bearer and rejects others", () => {
    process.env.MYASSIST_MCP_CLIENTS_JSON = JSON.stringify([
      { bearerToken: "secret-a", userId: "user-a" },
      { bearerToken: "secret-b", userId: "user-b" },
    ]);
    expect(resolveMcpUserFromClientList("secret-a")).toEqual({ userId: "user-a" });
    expect(resolveMcpUserFromClientList("secret-b")).toEqual({ userId: "user-b" });
    expect(resolveMcpUserFromClientList("wrong")).toBe("no_match");
  });
});
