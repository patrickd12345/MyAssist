import { describe, expect, it } from "vitest";
import { lifecycleStageSchema } from "job-hunt-manager/types/lifecycle";
import { LIFECYCLE_STAGE_DEFINITIONS } from "./jobHuntStageDefinitions";

describe("LIFECYCLE_STAGE_DEFINITIONS", () => {
  it("defines every lifecycle stage from the schema", () => {
    for (const stage of lifecycleStageSchema.options) {
      expect(LIFECYCLE_STAGE_DEFINITIONS[stage].length).toBeGreaterThan(10);
    }
  });
});
