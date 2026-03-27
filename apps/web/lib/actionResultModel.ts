/**
 * Client-safe unified shapes for post-action trust / review UI.
 */

export type ActionOutcomeKind = "success" | "deduped" | "partial" | "failed";

export type TargetSummary = {
  id: string;
  label: string;
  href?: string | null;
};

export type UnifiedActionFeedback = {
  outcome: ActionOutcomeKind;
  title: string;
  message: string;
  href?: string;
  reusedTargets?: TargetSummary[];
  createdTargets?: TargetSummary[];
  /** User can clear without provider calls (toast-style). */
  dismissible?: boolean;
};

const ACTION_LABELS: Record<string, string> = {
  email_to_task: "Email → task",
  email_to_event: "Email → calendar",
  task_to_calendar_block: "Task → calendar block",
  calendar_create_manual: "Calendar block",
  job_hunt_prep_tasks: "Job prep tasks",
  complete_task: "Complete task",
  archive_email: "Archive email",
};

export function formatActionTypeLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

type LooseBody = {
  ok?: boolean;
  error?: string;
  action?: string;
  dedupe?: {
    deduped?: boolean;
    message?: string;
    reusedTargetIds?: string[];
    reusedTargetSummaries?: Array<{ id?: string; label?: string; href?: string | null }>;
  };
  opportunityLinkage?: { calendarEventId?: string };
  taskSummary?: { id?: string; content?: string; url?: string | null };
  taskSummaries?: Array<{ id?: string; content?: string; url?: string | null }>;
  eventSummary?: { id?: string; summary?: string };
  outcome?: string;
  draft?: unknown;
};

function toTargets(items: Array<{ id?: string; content?: string; url?: string | null } | undefined>): TargetSummary[] {
  const out: TargetSummary[] = [];
  for (const item of items) {
    if (!item) continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    const label =
      typeof item.content === "string" && item.content.trim() ? item.content.trim() : id;
    out.push({
      id,
      label,
      href: typeof item.url === "string" ? item.url : null,
    });
  }
  return out;
}

/**
 * Maps `/api/actions` JSON bodies to a consistent feedback object for banners and history context.
 */
export function buildFeedbackFromActionResponse(body: unknown): UnifiedActionFeedback | null {
  if (!body || typeof body !== "object") return null;
  const b = body as LooseBody;
  const actionLabel = formatActionTypeLabel(typeof b.action === "string" ? b.action : "action");

  if (b.ok === false) {
    const err = typeof b.error === "string" ? b.error : "Action failed.";
    return {
      outcome: "failed",
      title: `${actionLabel} failed`,
      message: err,
      dismissible: true,
    };
  }

  if (b.dedupe?.deduped && typeof b.dedupe.message === "string") {
    const reused: TargetSummary[] = [];
    if (Array.isArray(b.dedupe.reusedTargetSummaries)) {
      for (const item of b.dedupe.reusedTargetSummaries) {
        const id = typeof item?.id === "string" ? item.id.trim() : "";
        if (!id) continue;
        reused.push({
          id,
          label: typeof item?.label === "string" && item.label.trim() ? item.label.trim() : id,
          href: typeof item?.href === "string" ? item.href : null,
        });
      }
    } else if (Array.isArray(b.dedupe.reusedTargetIds)) {
      for (const id of b.dedupe.reusedTargetIds) {
        if (typeof id === "string" && id.trim()) {
          const t = id.trim();
          reused.push({ id: t, label: t });
        }
      }
    }
    return {
      outcome: "deduped",
      title: actionLabel,
      message: b.dedupe.message,
      reusedTargets: reused.length > 0 ? reused : undefined,
      dismissible: true,
    };
  }

  if (b.outcome === "suggestion" && b.draft) {
    return {
      outcome: "partial",
      title: `${actionLabel} needs confirmation`,
      message: "Could not apply automatically — review the suggestion in context.",
      dismissible: true,
    };
  }

  const created: TargetSummary[] = [];
  if (b.taskSummary?.id) {
    created.push({
      id: b.taskSummary.id,
      label: typeof b.taskSummary.content === "string" ? b.taskSummary.content : b.taskSummary.id,
      href: b.taskSummary.url ?? null,
    });
  }
  if (Array.isArray(b.taskSummaries)) {
    created.push(...toTargets(b.taskSummaries));
  }
  if (b.eventSummary?.id) {
    created.push({
      id: b.eventSummary.id,
      label: typeof b.eventSummary.summary === "string" ? b.eventSummary.summary : b.eventSummary.id,
    });
  }

  const message =
    created.length > 0
      ? `Created ${created.length} linked item${created.length === 1 ? "" : "s"}.`
      : "Completed.";

  return {
    outcome: "success",
    title: actionLabel,
    message,
    createdTargets: created.length > 0 ? created : undefined,
    dismissible: true,
  };
}
