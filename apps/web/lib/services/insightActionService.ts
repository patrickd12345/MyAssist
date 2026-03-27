/**
 * Client-safe insight actions: maps automation intents to `/api/actions` or navigation.
 * Does not import server-only modules (crossSystemActionService stays on the API route).
 */

export type InsightAutomationType =
  | "create_prep_tasks"
  | "create_followup_task"
  | "draft_followup"
  | "block_focus_time"
  | "open_job_hunt";

/** Payload keys are optional; callers should pass messageId/taskId when available. */
export type InsightAutomationPayload = {
  messageId?: string;
  taskId?: string;
  start?: string;
  end?: string;
};

export type InsightAutomationAction = {
  type: InsightAutomationType;
  payload?: InsightAutomationPayload;
};

export type NavSuggestedAction =
  | { kind: "tab"; tab: "tasks" | "inbox" | "calendar" | "assistant" }
  | { kind: "focus_inbox" };

/**
 * Navigation (tab) plus structured automation actions for one-click execution.
 */
export type SuggestedAction = NavSuggestedAction | InsightAutomationAction;

export function isInsightAutomationAction(action: SuggestedAction): action is InsightAutomationAction {
  return "type" in action && typeof (action as InsightAutomationAction).type === "string";
}

export function isNavSuggestedAction(action: SuggestedAction): action is NavSuggestedAction {
  return "kind" in action;
}

export function automationButtonLabel(type: InsightAutomationType): string {
  switch (type) {
    case "create_prep_tasks":
      return "Create prep tasks";
    case "create_followup_task":
      return "Follow up";
    case "draft_followup":
      return "Draft follow-up";
    case "block_focus_time":
      return "Block time";
    case "open_job_hunt":
      return "Open Job Hunt";
    default:
      return "Run";
  }
}

export type InsightExecutionResult =
  | { outcome: "navigate_tab"; tab: "tasks" | "inbox" | "calendar" | "assistant" }
  | { outcome: "navigate_href"; href: string }
  | { outcome: "api"; ok: boolean; status: number; body: unknown }
  | { outcome: "noop" };

async function postAction(body: Record<string, unknown>): Promise<InsightExecutionResult> {
  const res = await fetch("/api/actions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = { error: "invalid_json" };
  }
  return { outcome: "api", ok: res.ok, status: res.status, body: parsed };
}

function requireMessageId(payload: InsightAutomationPayload | undefined): string | null {
  const id = payload?.messageId?.trim();
  return id || null;
}

function requireTaskId(payload: InsightAutomationPayload | undefined): string | null {
  const id = payload?.taskId?.trim();
  return id || null;
}

/**
 * Executes a single suggested action: navigation, GET-less API calls to `/api/actions`, or no-op.
 */
export async function executeInsightAction(action: SuggestedAction): Promise<InsightExecutionResult> {
  if (isNavSuggestedAction(action)) {
    if (action.kind === "focus_inbox") {
      return { outcome: "navigate_tab", tab: "inbox" };
    }
    return { outcome: "navigate_tab", tab: action.tab };
  }

  const { type, payload } = action;

  switch (type) {
    case "open_job_hunt":
      return { outcome: "navigate_href", href: "/job-hunt" };

    case "draft_followup":
      return { outcome: "navigate_tab", tab: "assistant" };

    case "create_prep_tasks": {
      const messageId = requireMessageId(payload);
      if (!messageId) return { outcome: "noop" };
      return postAction({ action: "job_hunt_prep_tasks", sourceId: messageId });
    }

    case "create_followup_task": {
      const messageId = requireMessageId(payload);
      if (!messageId) return { outcome: "noop" };
      return postAction({ action: "email_to_task", sourceId: messageId });
    }

    case "block_focus_time": {
      const messageId = requireMessageId(payload);
      const taskId = requireTaskId(payload);
      if (taskId) {
        return postAction({ action: "task_to_calendar_block", sourceId: taskId });
      }
      if (messageId) {
        return postAction({ action: "email_to_event", sourceId: messageId });
      }
      const start =
        payload?.start && typeof payload.start === "string"
          ? payload.start
          : new Date().toISOString();
      const end =
        payload?.end && typeof payload.end === "string"
          ? payload.end
          : new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
      return postAction({
        action: "calendar_create_manual",
        sourceId: "",
        payload: {
          summary: "Focus block",
          description: "Blocked from Today Insights",
          start,
          end,
          origin: "task_to_calendar_block",
          correlationSourceId: "insight_focus_block",
        },
      });
    }

    default:
      return { outcome: "noop" };
  }
}

/** Flatten optional multi-actions + legacy single action for rendering. */
export function insightActionsToRender(insight: {
  actions?: SuggestedAction[];
  action?: SuggestedAction;
}): SuggestedAction[] {
  if (insight.actions && insight.actions.length > 0) return insight.actions;
  if (insight.action) return [insight.action];
  return [];
}

export function insightActionButtonLabel(action: SuggestedAction): string {
  if (isNavSuggestedAction(action)) {
    if (action.kind === "focus_inbox") return "Open inbox";
    return "Open";
  }
  return automationButtonLabel(action.type);
}

/** Stable key for pending UI state (same action → same key). */
export function insightActionPendingKey(insightId: string, action: SuggestedAction): string {
  if (isNavSuggestedAction(action)) {
    if (action.kind === "focus_inbox") return `${insightId}|nav|inbox`;
    return `${insightId}|nav|${action.tab}`;
  }
  const { type, payload } = action;
  const messageId = payload?.messageId?.trim() ?? "";
  const taskId = payload?.taskId?.trim() ?? "";
  const start = typeof payload?.start === "string" ? payload.start : "";
  const end = typeof payload?.end === "string" ? payload.end : "";
  return `${insightId}|${type}|${messageId}|${taskId}|${start}|${end}`;
}
