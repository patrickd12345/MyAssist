import { describe, expect, it } from "vitest";
import { classifyTrackForJob } from "../src/core/track-classifier.js";
import { builtinTracks } from "../src/types/tracks.js";
import type { UnifiedJob } from "../src/types/job.js";

const base: Omit<UnifiedJob, "title" | "description" | "tags"> = {
  id: "1",
  company: "X",
  location: "",
  remote: false,
  type: "unknown",
  source: "rss",
  url: "u",
  posted_date: null,
  salary: null,
  track: "ai_focus",
};

describe("classifyTrackForJob", () => {
  it("prefers sap_bridge for SAP-heavy text", () => {
    const j: UnifiedJob = {
      ...base,
      title: "SAP FI/CO consultant",
      description: "S/4HANA implementation",
      tags: [],
    };
    const { track_guess } = classifyTrackForJob(j, builtinTracks());
    expect(track_guess).toBe("sap_bridge");
  });

  it("prefers ai_focus for ML-heavy text", () => {
    const j: UnifiedJob = {
      ...base,
      title: "Senior LLM Engineer",
      description: "GenAI RAG pipelines",
      tags: [],
    };
    const { track_guess } = classifyTrackForJob(j, builtinTracks());
    expect(track_guess).toBe("ai_focus");
  });
});
