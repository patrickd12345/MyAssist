import { describe, it, expect } from "vitest";
import {
  buildBoundaryPayloadFromAssistantTurn,
  formatPersistentMemoryContextForPrompt,
} from "./standard2bPersistentMemory";
import type { PersistentSessionHandle } from "@bookiji-inc/persistent-memory-runtime";

describe("standard2bPersistentMemory", () => {
  describe("formatPersistentMemoryContextForPrompt", () => {
    it("returns empty message when no history", () => {
      const handle = {
        memory: {
          lastCommitted: null,
          history: [],
        },
      } as unknown as PersistentSessionHandle;
      const result = formatPersistentMemoryContextForPrompt(handle);
      expect(result).toContain("No prior Standard 2b session boundaries");
    });

    it("formats lastCommitted and history tail", () => {
      const handle = {
        memory: {
          lastCommitted: { summary: "last one", next_actions: [], newlyActiveWork: [], in_progress: [] },
          history: [
            { summary: "h1", next_actions: [], newlyActiveWork: [], in_progress: [] },
            { summary: "h2", next_actions: [], newlyActiveWork: [], in_progress: [] },
            { summary: "h3", next_actions: [], newlyActiveWork: [], in_progress: [] },
            { summary: "h4", next_actions: [], newlyActiveWork: [], in_progress: [] },
          ],
        },
      } as unknown as PersistentSessionHandle;
      const result = formatPersistentMemoryContextForPrompt(handle);
      expect(result).toContain("last_committed:");
      expect(result).toContain("last one");
      expect(result).toContain("recent_boundaries_tail (3):");
      expect(result).not.toContain("h1"); // slice(-3)
      expect(result).toContain("h2");
      expect(result).toContain("h3");
      expect(result).toContain("h4");
    });
  });

  describe("buildBoundaryPayloadFromAssistantTurn", () => {
    it("returns null if no structure is present", () => {
      const turn = {
        answer: "hello",
        actions: [],
        followUps: [],
        taskDraft: null,
      };
      expect(buildBoundaryPayloadFromAssistantTurn(turn)).toBeNull();
    });

    it("returns payload if actions are present", () => {
      const turn = {
        answer: "here is an action",
        actions: ["do thing"],
        followUps: [],
        taskDraft: null,
      };
      const payload = buildBoundaryPayloadFromAssistantTurn(turn);
      expect(payload).not.toBeNull();
      expect(payload?.summary).toBe("here is an action");
      expect(payload?.next_actions).toContain("do thing");
    });

    it("includes taskDraft in in_progress", () => {
      const turn = {
        answer: "created task",
        actions: [],
        followUps: [],
        taskDraft: {
          content: "buy milk",
          dueString: "today",
          priority: 1 as const,
        },
      };
      const payload = buildBoundaryPayloadFromAssistantTurn(turn);
      expect(payload?.in_progress[0]).toContain("buy milk");
      expect(payload?.in_progress[0]).toContain("due:today");
      expect(payload?.in_progress[0]).toContain("p1");
    });
  });
});
