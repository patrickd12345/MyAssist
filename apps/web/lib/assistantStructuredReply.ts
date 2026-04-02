import type { AssistantReply, TaskDraft } from "@/lib/assistant";

export function parseAssistantStructuredReply(raw: string): Omit<AssistantReply, "mode"> {
  const fallback = {
    answer: "I could not generate a useful reply from the current context.",
    actions: [] as string[],
    followUps: [] as string[],
    taskDraft: null as TaskDraft | null,
  };

  try {
    const parsed = JSON.parse(raw) as {
      answer?: unknown;
      actions?: unknown;
      followUps?: unknown;
      taskDraft?: unknown;
    };

    const answer =
      typeof parsed.answer === "string" && parsed.answer.trim() ? parsed.answer.trim() : null;
    if (!answer) {
      return fallback;
    }

    return {
      answer,
      actions: Array.isArray(parsed.actions)
        ? parsed.actions.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, 2)
        : [],
      followUps: Array.isArray(parsed.followUps)
        ? parsed.followUps
            .filter((item): item is string => typeof item === "string" && item.trim() !== "")
            .slice(0, 2)
        : [],
      taskDraft: coerceTaskDraft(parsed.taskDraft),
    };
  } catch {
    const plainText = raw.trim();
    if (!plainText) return fallback;

    if (looksLikeContextDump(plainText)) return fallback;

    return {
      answer: plainText,
      actions: [],
      followUps: [],
      taskDraft: null,
    };
  }
}

export function looksLikeContextDump(text: string): boolean {
  if (!text.trim().startsWith("{")) return false;
  return (
    /"run_date"\s*:/.test(text) &&
    (/"urgent_counts"\s*:/.test(text) ||
      /"todoist_overdue"\s*:/.test(text) ||
      /"gmail_signals"\s*:/.test(text))
  );
}

export function coerceTaskDraft(value: unknown): TaskDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const content = typeof draft.content === "string" ? draft.content.trim() : "";
  if (!content) return null;

  const priorityRaw = draft.priority;
  const priority =
    priorityRaw === 1 || priorityRaw === 2 || priorityRaw === 3 || priorityRaw === 4
      ? priorityRaw
      : null;

  return {
    content,
    dueString: typeof draft.dueString === "string" && draft.dueString.trim() ? draft.dueString.trim() : null,
    description:
      typeof draft.description === "string" && draft.description.trim() ? draft.description.trim() : null,
    priority,
  };
}
