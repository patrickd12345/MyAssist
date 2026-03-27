import "server-only";

import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { CalendarEvent } from "@/lib/adapters/calendarAdapter";
import { createCalendarAdapter } from "@/lib/adapters/calendarAdapter";
import type { GmailMessage } from "@/lib/adapters/gmailAdapter";
import { createGmailAdapter } from "@/lib/adapters/gmailAdapter";
import { createTodoistAdapter } from "@/lib/adapters/todoistAdapter";
import type { JobHuntCalendarOpportunityLink } from "@/lib/types";
import { analyzeEmail } from "@/lib/services/jobHuntIntelligenceService";

export type ActionName =
  | "email_to_task"
  | "email_to_event"
  | "task_to_calendar_block"
  | "calendar_create_manual"
  | "job_hunt_prep_tasks"
  | "complete_task"
  | "archive_email";

const JOB_PREP_TASK_CONTENTS = [
  "Research company",
  "Review role description",
  "Prepare interview questions",
  "Test microphone and camera",
  "Review resume for this role",
] as const;

export type SuggestionReason =
  | "insufficient_datetime"
  | "calendar_slot_busy"
  | "insufficient_scheduling";

export type ManualCalendarOrigin = "email_to_event" | "task_to_calendar_block";

export type ManualCalendarCreateInput = {
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  correlationSourceId: string;
  origin: ManualCalendarOrigin;
};

type ActionStatus = "success" | "failed";
type ActionProvider = "gmail" | "google_calendar" | "todoist";

export type RefreshHints = {
  providers: ActionProvider[];
  sourceIds: string[];
  targetIds: string[];
};

type ActionLogEntry = {
  action: ActionName;
  status: ActionStatus;
  timestamp: string;
  sourceIds: string[];
  targetIds: string[];
  providers: ActionProvider[];
  error?: string;
  dedupeKey?: string;
  sourceMessageId?: string;
  sourceThreadId?: string;
  deduped?: boolean;
};

const DEFAULT_FOCUS_BLOCK_MINUTES = 30;
const ACTION_DEDUPE_WINDOW_MS = 15 * 60 * 1000;
const ACTION_LOG_TAIL_LINES = 300;

export type TaskSummary = {
  id: string;
  content: string;
  url: string | null;
};

export type ReusedTargetSummary = {
  id: string;
  label: string;
  href?: string | null;
};

export type EventSummary = {
  id: string;
  summary: string;
  start: string | undefined;
  end: string | undefined;
};

/** User-visible dedupe feedback; only set when a recent equivalent action was reused. */
export type ActionDedupeInfo = {
  deduped: true;
  message: string;
  reusedTargetIds: string[];
  reusedTargetSummaries?: ReusedTargetSummary[];
};

export type CalendarSuggestionDraft = {
  summary: string;
  description: string;
  proposedStart?: string;
  proposedEnd?: string;
  reason: SuggestionReason;
};

export type CrossSystemActionResult =
  | {
      ok: true;
      action: "email_to_task";
      sourceEmailId: string;
      taskSummary: TaskSummary;
      refreshHints: RefreshHints;
      dedupe?: ActionDedupeInfo;
    }
  | {
      ok: true;
      action: "email_to_event";
      sourceEmailId: string;
      outcome: "created";
      eventSummary: EventSummary;
      refreshHints: RefreshHints;
      dedupe?: ActionDedupeInfo;
      opportunityLinkage?: JobHuntCalendarOpportunityLink;
    }
  | {
      ok: true;
      action: "email_to_event";
      sourceEmailId: string;
      outcome: "suggestion";
      draft: CalendarSuggestionDraft;
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "task_to_calendar_block";
      sourceTaskId: string;
      outcome: "created";
      eventSummary: EventSummary;
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "task_to_calendar_block";
      sourceTaskId: string;
      outcome: "suggestion";
      draft: CalendarSuggestionDraft;
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "complete_task";
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "archive_email";
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "calendar_create_manual";
      eventSummary: EventSummary;
      refreshHints: RefreshHints;
    }
  | {
      ok: true;
      action: "job_hunt_prep_tasks";
      sourceEmailId: string;
      taskSummaries: TaskSummary[];
      refreshHints: RefreshHints;
      dedupe?: ActionDedupeInfo;
    }
  | {
      ok: false;
      action: ActionName;
      error: string;
      refreshHints: RefreshHints;
    };

function sanitizeUserId(userId: string): string {
  const trimmed = userId.trim();
  if (!trimmed) return "_anonymous";
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
}

function actionLogPath(userId: string): string {
  return path.join(process.cwd(), ".myassist-memory", "users", sanitizeUserId(userId), "action-log.jsonl");
}

async function logAction(userId: string, entry: ActionLogEntry): Promise<void> {
  const target = actionLogPath(userId);
  await mkdir(path.dirname(target), { recursive: true });
  await appendFile(target, `${JSON.stringify(entry)}\n`, "utf8");
}

async function readRecentActionEntries(userId: string, maxLines = ACTION_LOG_TAIL_LINES): Promise<ActionLogEntry[]> {
  const target = actionLogPath(userId);
  try {
    const raw = await readFile(target, "utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    const tail = lines.slice(Math.max(0, lines.length - maxLines));
    const out: ActionLogEntry[] = [];
    for (const line of tail) {
      try {
        const parsed = JSON.parse(line) as ActionLogEntry;
        if (
          parsed &&
          typeof parsed.action === "string" &&
          typeof parsed.status === "string" &&
          typeof parsed.timestamp === "string" &&
          Array.isArray(parsed.sourceIds) &&
          Array.isArray(parsed.targetIds) &&
          Array.isArray(parsed.providers)
        ) {
          out.push(parsed);
        }
      } catch {
        // Ignore malformed lines to keep dedupe best-effort.
      }
    }
    return out;
  } catch {
    return [];
  }
}

function dedupeWindowStart(nowMs = Date.now()): number {
  return nowMs - ACTION_DEDUPE_WINDOW_MS;
}

function buildDedupeKey(parts: Array<string | null | undefined>): string {
  return parts
    .map((p) => (p ?? "").trim().toLowerCase())
    .filter(Boolean)
    .join("|");
}

function latestSuccessfulEntryInWindow(
  entries: ActionLogEntry[],
  action: ActionName,
  dedupeKey: string,
  nowMs = Date.now(),
): ActionLogEntry | null {
  if (!dedupeKey) return null;
  const minTs = dedupeWindowStart(nowMs);
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    if (!entry) continue;
    if (entry.action !== action || entry.status !== "success") continue;
    if ((entry.dedupeKey ?? "") !== dedupeKey) continue;
    const ts = Date.parse(entry.timestamp);
    if (!Number.isNaN(ts) && ts >= minTs) return entry;
  }
  return null;
}

function toIsoFromMs(ms: number): string | null {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function titleFromEmailSubject(subject: string): string {
  const raw = subject.replace(/^\s*(re|fwd)\s*:\s*/gi, "").trim();
  const collapsed = raw.replace(/\s+/g, " ").trim();
  if (!collapsed) return "(no subject email)";
  return collapsed.length > 200 ? `${collapsed.slice(0, 197)}...` : collapsed;
}

function gmailBacklinkLine(email: GmailMessage): string {
  if (email.threadId) {
    return `Gmail: https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(email.threadId)}`;
  }
  if (email.id) {
    return `Gmail message id: ${email.id}`;
  }
  return "";
}

function emailBodyForDescription(email: GmailMessage): string {
  const back = gmailBacklinkLine(email);
  const base = [`From: ${email.from}`, "", email.snippet].filter(Boolean).join("\n");
  return back ? `${base}\n\n${back}` : base;
}

function reliableEventStartIsoFromEmail(email: GmailMessage): string | null {
  if (email.internalDate) {
    const ms = Number(email.internalDate);
    if (Number.isFinite(ms)) {
      return toIsoFromMs(ms);
    }
  }
  const header = email.date?.trim() ?? "";
  if (!header) return null;
  const iso = toIso(header);
  if (!iso) return null;
  const hasExplicitTime =
    /:\d{2}/.test(header) ||
    /\b\d{1,2}\s+[ap]m\b/i.test(header) ||
    /GMT|UTC|UT\b|[+-]\d{4}\b|[+-]\d{2}:\d{2}\b/i.test(header);
  if (!hasExplicitTime) return null;
  return iso;
}

function calendarEventTimeRangeMs(ev: CalendarEvent): { start: number; end: number } | null {
  const startRaw = ev.start.dateTime ?? ev.start.date;
  if (!startRaw) return null;
  const startMs = new Date(startRaw).getTime();
  if (Number.isNaN(startMs)) return null;
  const endRaw = ev.end.dateTime ?? ev.end.date;
  let endMs = endRaw ? new Date(endRaw).getTime() : startMs + DEFAULT_FOCUS_BLOCK_MINUTES * 60 * 1000;
  if (Number.isNaN(endMs)) {
    endMs = startMs + DEFAULT_FOCUS_BLOCK_MINUTES * 60 * 1000;
  }
  if (ev.start.date && !ev.start.dateTime) {
    endMs = Math.max(endMs, startMs + 24 * 60 * 60 * 1000);
  }
  return { start: startMs, end: endMs };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

async function proposedBlockOverlapsExisting(
  calendar: ReturnType<typeof createCalendarAdapter>,
  windowStartIso: string,
  windowEndIso: string,
): Promise<boolean> {
  const startMs = new Date(windowStartIso).getTime();
  const endMs = new Date(windowEndIso).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return true;
  const dayAnchor = new Date(startMs);
  const events = await calendar.getToday({ now: dayAnchor });
  for (const ev of events) {
    const range = calendarEventTimeRangeMs(ev);
    if (!range) continue;
    if (rangesOverlap(startMs, endMs, range.start, range.end)) {
      return true;
    }
  }
  return false;
}

function eventSummaryFromCalendarEvent(ev: { id: string; summary: string; start: CalendarEvent["start"]; end: CalendarEvent["end"] }): EventSummary {
  return {
    id: ev.id,
    summary: ev.summary,
    start: ev.start.dateTime ?? ev.start.date,
    end: ev.end.dateTime ?? ev.end.date,
  };
}

const DEDUPE_MSG_EMAIL_TO_TASK = "Follow-up task was already created recently from this thread.";
const DEDUPE_MSG_PREP_TASKS = "Prep tasks were already created recently for this thread.";
const DEDUPE_MSG_EMAIL_TO_EVENT = "Calendar event was already created recently for this thread.";

function opportunityLinkageFromEmail(email: GmailMessage, calendarEventId: string): JobHuntCalendarOpportunityLink {
  const analysis = analyzeEmail({
    id: email.id,
    threadId: email.threadId,
    from: email.from,
    subject: email.subject,
    snippet: email.snippet,
  });
  return {
    sourceMessageId: email.id,
    sourceThreadId: email.threadId,
    calendarEventId,
    normalizedIdentity: analysis.normalizedIdentity,
    stageAlias: analysis.stageAlias,
  };
}

export class CrossSystemActionService {
  private readonly gmail;
  private readonly calendar;
  private readonly todoist;

  constructor(private readonly userId: string) {
    this.gmail = createGmailAdapter(userId);
    this.calendar = createCalendarAdapter(userId);
    this.todoist = createTodoistAdapter(userId);
  }

  async emailToTask(emailId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "email_to_task";
    const sourceId = emailId.trim();
    const refreshFull: RefreshHints = { providers: ["gmail", "todoist"], sourceIds: [sourceId], targetIds: [] };
    try {
      const email = await this.gmail.getById(sourceId);
      if (!email) throw new Error("email_not_found");
      const content = titleFromEmailSubject(email.subject);
      const description = emailBodyForDescription(email);
      const dedupeKey = buildDedupeKey([
        action,
        email.threadId ?? sourceId,
        content,
      ]);
      const recent = latestSuccessfulEntryInWindow(
        await readRecentActionEntries(this.userId),
        action,
        dedupeKey,
      );
      if (recent && recent.targetIds.length > 0) {
        const taskId = recent.targetIds[0] ?? "";
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: recent.targetIds,
          providers: ["gmail", "todoist"],
          dedupeKey,
          sourceMessageId: sourceId,
          sourceThreadId: email.threadId ?? undefined,
          deduped: true,
        });
        return {
          ok: true,
          action,
          sourceEmailId: sourceId,
          taskSummary: { id: taskId, content, url: null },
          refreshHints: { ...refreshFull, targetIds: recent.targetIds },
          dedupe: {
            deduped: true,
            message: DEDUPE_MSG_EMAIL_TO_TASK,
            reusedTargetIds: recent.targetIds,
            reusedTargetSummaries: recent.targetIds.map((id) => ({ id, label: content })),
          },
        };
      }
      const task = await this.todoist.create({
        content,
        description,
        dueString: "today",
        dueLang: "en",
      });
      const targetIds = [task.id];
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds,
        providers: ["gmail", "todoist"],
        dedupeKey,
        sourceMessageId: sourceId,
        sourceThreadId: email.threadId ?? undefined,
      });
      return {
        ok: true,
        action,
        sourceEmailId: sourceId,
        taskSummary: { id: task.id, content: task.content, url: task.url },
        refreshHints: { ...refreshFull, targetIds },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "email_to_task_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["gmail", "todoist"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { ...refreshFull, targetIds: [] },
      };
    }
  }

  async jobHuntPrepTasks(emailId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "job_hunt_prep_tasks";
    const sourceId = emailId.trim();
    const refreshFull: RefreshHints = { providers: ["gmail", "todoist"], sourceIds: [sourceId], targetIds: [] };
    try {
      const email = await this.gmail.getById(sourceId);
      if (!email) throw new Error("email_not_found");
      const description = emailBodyForDescription(email);
      const dedupeKey = buildDedupeKey([
        action,
        email.threadId ?? sourceId,
        "prep_bundle_v1",
      ]);
      const recent = latestSuccessfulEntryInWindow(
        await readRecentActionEntries(this.userId),
        action,
        dedupeKey,
      );
      if (recent && recent.targetIds.length > 0) {
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: recent.targetIds,
          providers: ["gmail", "todoist"],
          dedupeKey,
          sourceMessageId: sourceId,
          sourceThreadId: email.threadId ?? undefined,
          deduped: true,
        });
        return {
          ok: true,
          action,
          sourceEmailId: sourceId,
          taskSummaries: recent.targetIds.map((id, idx) => ({
            id,
            content: `[Job prep] ${JOB_PREP_TASK_CONTENTS[idx] ?? "Task"}`,
            url: null,
          })),
          refreshHints: { ...refreshFull, targetIds: recent.targetIds },
          dedupe: {
            deduped: true,
            message: DEDUPE_MSG_PREP_TASKS,
            reusedTargetIds: recent.targetIds,
            reusedTargetSummaries: recent.targetIds.map((id, idx) => ({
              id,
              label: `[Job prep] ${JOB_PREP_TASK_CONTENTS[idx] ?? "Task"}`,
            })),
          },
        };
      }
      const taskSummaries: TaskSummary[] = [];
      for (const content of JOB_PREP_TASK_CONTENTS) {
        const task = await this.todoist.create({
          content: `[Job prep] ${content}`,
          description,
          dueString: "today",
          dueLang: "en",
          priority: 3,
        });
        taskSummaries.push({ id: task.id, content: task.content, url: task.url });
      }
      const targetIds = taskSummaries.map((t) => t.id);
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds,
        providers: ["gmail", "todoist"],
        dedupeKey,
        sourceMessageId: sourceId,
        sourceThreadId: email.threadId ?? undefined,
      });
      return {
        ok: true,
        action,
        sourceEmailId: sourceId,
        taskSummaries,
        refreshHints: { ...refreshFull, targetIds },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "job_hunt_prep_tasks_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["gmail", "todoist"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { ...refreshFull, targetIds: [] },
      };
    }
  }

  async emailToEvent(emailId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "email_to_event";
    const sourceId = emailId.trim();
    const refreshOnWrite: RefreshHints = {
      providers: ["gmail", "google_calendar"],
      sourceIds: [sourceId],
      targetIds: [],
    };
    try {
      const email = await this.gmail.getById(sourceId);
      if (!email) throw new Error("email_not_found");
      const startIso = reliableEventStartIsoFromEmail(email);
      const summary = email.subject?.trim() ? titleFromEmailSubject(email.subject) : "Email follow-up";
      const description = emailBodyForDescription(email);

      if (!startIso) {
        const draft: CalendarSuggestionDraft = {
          summary,
          description,
          reason: "insufficient_datetime",
        };
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: [],
          providers: [],
        });
        return {
          ok: true,
          action,
          sourceEmailId: sourceId,
          outcome: "suggestion",
          draft,
          refreshHints: { providers: [], sourceIds: [sourceId], targetIds: [] },
        };
      }

      const endIso = new Date(new Date(startIso).getTime() + DEFAULT_FOCUS_BLOCK_MINUTES * 60 * 1000).toISOString();
      const overlaps = await proposedBlockOverlapsExisting(this.calendar, startIso, endIso);
      if (overlaps) {
        const draft: CalendarSuggestionDraft = {
          summary,
          description,
          proposedStart: startIso,
          proposedEnd: endIso,
          reason: "calendar_slot_busy",
        };
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: [],
          providers: ["google_calendar"],
        });
        return {
          ok: true,
          action,
          sourceEmailId: sourceId,
          outcome: "suggestion",
          draft,
          refreshHints: { providers: ["google_calendar"], sourceIds: [sourceId], targetIds: [] },
        };
      }
      const dedupeKey = buildDedupeKey([
        action,
        email.threadId ?? sourceId,
        summary,
        startIso,
        endIso,
      ]);
      const recent = latestSuccessfulEntryInWindow(
        await readRecentActionEntries(this.userId),
        action,
        dedupeKey,
      );
      if (recent && recent.targetIds.length > 0) {
        const existingId = recent.targetIds[0] ?? "";
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: recent.targetIds,
          providers: ["gmail", "google_calendar"],
          dedupeKey,
          sourceMessageId: sourceId,
          sourceThreadId: email.threadId ?? undefined,
          deduped: true,
        });
        return {
          ok: true,
          action,
          sourceEmailId: sourceId,
          outcome: "created",
          eventSummary: { id: existingId, summary, start: startIso, end: endIso },
          refreshHints: { ...refreshOnWrite, targetIds: recent.targetIds },
          dedupe: {
            deduped: true,
            message: DEDUPE_MSG_EMAIL_TO_EVENT,
            reusedTargetIds: recent.targetIds,
            reusedTargetSummaries: recent.targetIds.map((id) => ({ id, label: summary })),
          },
          opportunityLinkage: opportunityLinkageFromEmail(email, existingId),
        };
      }

      const event = await this.calendar.create({
        summary,
        description,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      });
      const targetIds = [event.id];
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds,
        providers: ["gmail", "google_calendar"],
        dedupeKey,
        sourceMessageId: sourceId,
        sourceThreadId: email.threadId ?? undefined,
      });
      return {
        ok: true,
        action,
        sourceEmailId: sourceId,
        outcome: "created",
        eventSummary: eventSummaryFromCalendarEvent(event),
        refreshHints: { ...refreshOnWrite, targetIds },
        opportunityLinkage: opportunityLinkageFromEmail(email, event.id),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "email_to_event_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["gmail", "google_calendar"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { ...refreshOnWrite },
      };
    }
  }

  async taskToCalendarBlock(taskId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "task_to_calendar_block";
    const sourceId = taskId.trim();
    const refreshOnWrite: RefreshHints = {
      providers: ["todoist", "google_calendar"],
      sourceIds: [sourceId],
      targetIds: [],
    };
    try {
      const task = await this.todoist.getById(sourceId);
      if (!task) throw new Error("task_not_found");

      const startIso =
        typeof task.due?.datetime === "string" && task.due.datetime.trim()
          ? toIso(task.due.datetime.trim())
          : null;

      if (!startIso) {
        const draft: CalendarSuggestionDraft = {
          summary: `Focus block: ${task.content}`,
          description: [task.description?.trim() || "Created from Todoist task", task.url ? `Todoist: ${task.url}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          reason: "insufficient_scheduling",
        };
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: [],
          providers: [],
        });
        return {
          ok: true,
          action,
          sourceTaskId: sourceId,
          outcome: "suggestion",
          draft,
          refreshHints: { providers: [], sourceIds: [sourceId], targetIds: [] },
        };
      }

      const endIso = new Date(new Date(startIso).getTime() + DEFAULT_FOCUS_BLOCK_MINUTES * 60 * 1000).toISOString();
      const overlaps = await proposedBlockOverlapsExisting(this.calendar, startIso, endIso);
      if (overlaps) {
        const draft: CalendarSuggestionDraft = {
          summary: `Focus block: ${task.content}`,
          description: [task.description?.trim() || "Created from Todoist task", task.url ? `Todoist: ${task.url}` : ""]
            .filter(Boolean)
            .join("\n\n"),
          proposedStart: startIso,
          proposedEnd: endIso,
          reason: "calendar_slot_busy",
        };
        await logAction(this.userId, {
          action,
          status: "success",
          timestamp: new Date().toISOString(),
          sourceIds: [sourceId],
          targetIds: [],
          providers: ["google_calendar"],
        });
        return {
          ok: true,
          action,
          sourceTaskId: sourceId,
          outcome: "suggestion",
          draft,
          refreshHints: { providers: ["google_calendar"], sourceIds: [sourceId], targetIds: [] },
        };
      }

      const event = await this.calendar.create({
        summary: `Focus block: ${task.content}`,
        description: [task.description?.trim() || "Created from Todoist task", task.url ? `Todoist: ${task.url}` : ""]
          .filter(Boolean)
          .join("\n\n"),
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      });
      const targetIds = [event.id];
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds,
        providers: ["todoist", "google_calendar"],
      });
      return {
        ok: true,
        action,
        sourceTaskId: sourceId,
        outcome: "created",
        eventSummary: eventSummaryFromCalendarEvent(event),
        refreshHints: { ...refreshOnWrite, targetIds },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "task_to_calendar_block_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["todoist", "google_calendar"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { ...refreshOnWrite },
      };
    }
  }

  async createCalendarEventManual(input: ManualCalendarCreateInput): Promise<CrossSystemActionResult> {
    const action: ActionName = "calendar_create_manual";
    const correlationSourceId = input.correlationSourceId.trim();
    const summary = input.summary.trim();
    const description = input.description.trim();
    const startIso = toIso(input.startIso);
    const endIso = toIso(input.endIso);
    const refreshBase: RefreshHints = {
      providers: ["google_calendar"],
      sourceIds: correlationSourceId ? [correlationSourceId] : [],
      targetIds: [],
    };
    try {
      if (!summary) {
        throw new Error("summary_required");
      }
      if (!startIso || !endIso) {
        throw new Error("invalid_datetime");
      }
      const startMs = new Date(startIso).getTime();
      const endMs = new Date(endIso).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        throw new Error("invalid_time_range");
      }
      const overlaps = await proposedBlockOverlapsExisting(this.calendar, startIso, endIso);
      if (overlaps) {
        await logAction(this.userId, {
          action,
          status: "failed",
          timestamp: new Date().toISOString(),
          sourceIds: correlationSourceId ? [correlationSourceId] : [],
          targetIds: [],
          providers: ["google_calendar"],
          error: "calendar_slot_busy",
        });
        return {
          ok: false,
          action,
          error: "calendar_slot_busy",
          refreshHints: { ...refreshBase },
        };
      }
      const event = await this.calendar.create({
        summary,
        description,
        start: { dateTime: startIso },
        end: { dateTime: endIso },
      });
      const targetIds = [event.id];
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: correlationSourceId ? [correlationSourceId] : [],
        targetIds,
        providers: ["google_calendar"],
      });
      return {
        ok: true,
        action,
        eventSummary: eventSummaryFromCalendarEvent(event),
        refreshHints: { ...refreshBase, targetIds },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "calendar_create_manual_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: correlationSourceId ? [correlationSourceId] : [],
        targetIds: [],
        providers: ["google_calendar"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { ...refreshBase },
      };
    }
  }

  async completeTask(taskId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "complete_task";
    const sourceId = taskId.trim();
    try {
      await this.todoist.complete(sourceId);
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["todoist"],
      });
      return {
        ok: true,
        action,
        refreshHints: { providers: ["todoist"], sourceIds: [sourceId], targetIds: [] },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "complete_task_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["todoist"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { providers: ["todoist"], sourceIds: [sourceId], targetIds: [] },
      };
    }
  }

  async archiveEmail(emailId: string): Promise<CrossSystemActionResult> {
    const action: ActionName = "archive_email";
    const sourceId = emailId.trim();
    try {
      await this.gmail.archive(sourceId);
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["gmail"],
      });
      return {
        ok: true,
        action,
        refreshHints: { providers: ["gmail"], sourceIds: [sourceId], targetIds: [] },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "archive_email_failed";
      await logAction(this.userId, {
        action,
        status: "failed",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds: [],
        providers: ["gmail"],
        error: message,
      });
      return {
        ok: false,
        action,
        error: message,
        refreshHints: { providers: ["gmail"], sourceIds: [sourceId], targetIds: [] },
      };
    }
  }
}

export function createCrossSystemActionService(userId: string): CrossSystemActionService {
  return new CrossSystemActionService(userId);
}