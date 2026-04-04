import type { SessionBoundaryPayload } from "@bookiji-inc/persistent-memory-runtime";
import type { CanonicalChatMessage } from "@/lib/aiRuntime";

export function buildMyAssistBoundaryFromChat(
  messages: CanonicalChatMessage[],
  assistantPreview: string,
): SessionBoundaryPayload {
  const userLast =
    [...messages].reverse().find((m) => m.role === "user")?.content?.slice(0, 500) ?? "";
  const summary = assistantPreview.trim().slice(0, 800);
  return {
    sessionSummary: summary || "myassist:chat",
    decisionsMade: [],
    newlyActiveWork: userLast ? [userLast] : [],
    completedWork: [],
    current_focus: ["assistant"],
    blockers: [],
    in_progress: [],
    next_actions: summary ? [summary.slice(0, 240)] : [],
  };
}
