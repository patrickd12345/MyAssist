import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createCalendarAdapter } from "@/lib/adapters/calendarAdapter";
import { createGmailAdapter } from "@/lib/adapters/gmailAdapter";
import { createTodoistAdapter } from "@/lib/adapters/todoistAdapter";

type ActionName =
  | "email_to_task"
  | "email_to_event"
  | "task_to_calendar_block"
  | "complete_task"
  | "archive_email";

type ActionStatus = "success" | "failed";
type ActionProvider = "gmail" | "google_calendar" | "todoist";

type ActionLogEntry = {
  action: ActionName;
  status: ActionStatus;
  timestamp: string;
  sourceIds: string[];
  targetIds: string[];
  providers: ActionProvider[];
  error?: string;
};

type ActionResult = {
  ok: true;
  action: ActionName;
  refreshHints: {
    providers: ActionProvider[];
    sourceIds: string[];
    targetIds: string[];
  };
} | {
  ok: false;
  action: ActionName;
  error: string;
  refreshHints: {
    providers: ActionProvider[];
    sourceIds: string[];
    targetIds: string[];
  };
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

function toIso(input: string | null | undefined): string | null {
  if (!input) return null;
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
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

  async emailToTask(emailId: string): Promise<ActionResult> {
    const action: ActionName = "email_to_task";
    const sourceId = emailId.trim();
    try {
      const email = await this.gmail.getById(sourceId);
      if (!email) throw new Error("email_not_found");
      const task = await this.todoist.create({
        content: email.subject || "(no subject email)",
        description: `From: ${email.from}\n\n${email.snippet}`.trim(),
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
      });
      return {
        ok: true,
        action,
        refreshHints: { providers: ["gmail", "todoist"], sourceIds: [sourceId], targetIds },
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
        refreshHints: { providers: ["gmail", "todoist"], sourceIds: [sourceId], targetIds: [] },
      };
    }
  }

  async emailToEvent(emailId: string): Promise<ActionResult> {
    const action: ActionName = "email_to_event";
    const sourceId = emailId.trim();
    try {
      const email = await this.gmail.getById(sourceId);
      if (!email) throw new Error("email_not_found");
      const start = toIso(email.date) || new Date().toISOString();
      const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
      const event = await this.calendar.create({
        summary: email.subject || "Email follow-up",
        description: `From: ${email.from}\n\n${email.snippet}`.trim(),
        start: { dateTime: start },
        end: { dateTime: end },
      });
      const targetIds = [event.id];
      await logAction(this.userId, {
        action,
        status: "success",
        timestamp: new Date().toISOString(),
        sourceIds: [sourceId],
        targetIds,
        providers: ["gmail", "google_calendar"],
      });
      return {
        ok: true,
        action,
        refreshHints: { providers: ["gmail", "google_calendar"], sourceIds: [sourceId], targetIds },
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
        refreshHints: { providers: ["gmail", "google_calendar"], sourceIds: [sourceId], targetIds: [] },
      };
    }
  }

  async taskToCalendarBlock(taskId: string): Promise<ActionResult> {
    const action: ActionName = "task_to_calendar_block";
    const sourceId = taskId.trim();
    try {
      const task = await this.todoist.getById(sourceId);
      if (!task) throw new Error("task_not_found");
      const start = task.due?.datetime || new Date().toISOString();
      const end = new Date(new Date(start).getTime() + 30 * 60 * 1000).toISOString();
      const event = await this.calendar.create({
        summary: `Focus block: ${task.content}`,
        description: task.description || "Created from Todoist task",
        start: { dateTime: start },
        end: { dateTime: end },
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
        refreshHints: { providers: ["todoist", "google_calendar"], sourceIds: [sourceId], targetIds },
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
        refreshHints: { providers: ["todoist", "google_calendar"], sourceIds: [sourceId], targetIds: [] },
      };
    }
  }

  async completeTask(taskId: string): Promise<ActionResult> {
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

  async archiveEmail(emailId: string): Promise<ActionResult> {
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
