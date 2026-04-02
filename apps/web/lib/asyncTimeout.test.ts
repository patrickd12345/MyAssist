import { describe, expect, it } from "vitest";
import { withTimeout } from "./asyncTimeout";

describe("withTimeout", () => {
  it("returns resolved value when promise finishes before deadline", async () => {
    expect(await withTimeout(Promise.resolve(42), 5000)).toBe(42);
  });

  it("returns undefined when promise is slower than timeout", async () => {
    const slow = new Promise<string>((resolve) => {
      setTimeout(() => resolve("late"), 400);
    });
    const result = await withTimeout(slow, 30);
    expect(result).toBeUndefined();
  });

  it("returns undefined on rejection", async () => {
    const failing = Promise.reject(new Error("boom"));
    failing.catch(() => {});
    expect(await withTimeout(failing, 5000)).toBeUndefined();
  });
});
