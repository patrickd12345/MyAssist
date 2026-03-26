import { describe, expect, it } from "vitest";
import { computeSigningProbability } from "../src/core/probability.js";

describe("computeSigningProbability", () => {
  it("clamps score", () => {
    const { score } = computeSigningProbability({
      stage: "offer",
      touchpoints: [
        { at: "2020-01-01", channel: "email", direction: "incoming", subject: "x" },
        { at: "2020-01-02", channel: "email", direction: "incoming", subject: "y" },
      ],
    });
    expect(score).toBeLessThanOrEqual(100);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});
