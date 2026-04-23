import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./safeInternalPath";

describe("safeInternalPath", () => {
  it("allows normal paths", () => {
    expect(safeInternalPath("/dash")).toBe("/dash");
    expect(safeInternalPath("/tasks/inbox")).toBe("/tasks/inbox");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeInternalPath("//evil.example/phish")).toBe("/");
    expect(safeInternalPath("/%2f%2fphish.example/x")).toBe("/");
  });

  it("defaults bad input to root", () => {
    expect(safeInternalPath("https://evil")).toBe("/");
    expect(safeInternalPath("")).toBe("/");
    expect(safeInternalPath(undefined)).toBe("/");
  });
});
