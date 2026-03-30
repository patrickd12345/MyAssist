"use client";

import Link from "next/link";
import type { CommunicationDraftType, DraftLanguage } from "@/lib/assistant";
import { INBOX_JOB_HUNT_MIN_CONFIDENCE, inboxPriorityBadge } from "@/lib/inboxEmailSections";
import type { GmailSignal, JobHuntSignal } from "@/lib/types";
import type { SavedJobRow } from "@/lib/jobHuntUiTypes";
import { CommunicationDraftToolbar } from "./CommunicationDraftToolbar";

function firstName(from: string): string {
  const cleaned = from.replace(/".*?"/g, "").replace(/<.*?>/g, "").trim();
  return cleaned || from;
}

/** When labels are missing (older cache), assume unread so the primary action stays "Mark as read". */
function gmailMessageIsUnread(g: GmailSignal): boolean {
  const ids = g.label_ids;
  if (!ids || ids.length === 0) return true;
  return ids.includes("UNREAD");
}

function MailUnreadGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M1.5 8.67v8.58a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V8.67l-8.928 5.493a3 3 0 0 1-3.144 0L1.5 8.67Z" />
      <path d="M22.5 6.908V6.75a3 3 0 0 0-3-3h-15a3 3 0 0 0-3 3v.158l9.714 5.978a1.5 1.5 0 0 0 1.572 0L22.5 6.908Z" />
    </svg>
  );
}

function MailReadGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21.75 9v-.375a2.25 2.25 0 0 0-2.25-2.25H4.5A2.25 2.25 0 0 0 2.25 8.625V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9m-18 4.5h18M5.25 9h13.5m-16.5 4.5 7.72-4.492a.75.75 0 0 1 .78 0l7.72 4.492"
      />
    </svg>
  );
}

function formatJobHuntSignals(signals: JobHuntSignal[]): string {
  if (signals.length === 0) return "";
  const labels: Record<JobHuntSignal, string> = {
    interview_request: "Interview request",
    technical_interview: "Technical interview",
    follow_up: "Follow-up",
    offer: "Offer",
    rejection: "Rejection",
    application_confirmation: "Application confirmation",
  };
  return signals.map((s) => labels[s] ?? s).join(" · ");
}

function jobHuntReasonCopy(signal: JobHuntSignal): string {
  switch (signal) {
    case "interview_request":
      return "Scheduling language detected — add prep and protect time.";
    case "technical_interview":
      return "Technical interview language detected — prep matters.";
    case "follow_up":
      return "Follow-up language detected — capture a next step.";
    case "offer":
      return "Offer language detected — track negotiation and decisions.";
    case "rejection":
      return "Closure language detected — update pipeline when ready.";
    case "application_confirmation":
      return "Application acknowledgment detected — track the pipeline.";
    default:
      return "";
  }
}

function buildJobHuntHref(signal: GmailSignal): string {
  const p = new URLSearchParams();
  const identity = signal.job_hunt_analysis?.normalizedIdentity;
  const stageAlias = signal.job_hunt_analysis?.stageAlias;
  if (identity?.company) p.set("company", identity.company);
  if (identity?.role) p.set("role", identity.role);
  if (identity?.recruiterName) p.set("recruiter", identity.recruiterName);
  if (identity?.threadId || signal.threadId) p.set("threadId", identity?.threadId ?? String(signal.threadId));
  if (identity?.messageId || signal.id) p.set("messageId", identity?.messageId ?? String(signal.id));
  if (stageAlias) p.set("stage", stageAlias);
  p.set("tab", "pipeline");
  const q = p.toString();
  return q ? `/job-hunt?${q}` : "/job-hunt";
}

export type InboxEmailRowProps = {
  g: GmailSignal;
  emphasis: boolean;
  pendingCrossActionKeys: string[];
  ignoredJobHuntMessageIds: string[];
  onIgnoreJobHunt: (messageId: string) => void;
  runCrossSystemAction: (
    action: "email_to_task" | "email_to_event" | "task_to_calendar_block" | "job_hunt_prep_tasks",
    sourceId: string,
  ) => void | Promise<void>;
  communicationDraftLang: DraftLanguage;
  setCommunicationDraftLang: (next: DraftLanguage) => void;
  injectCommunicationDraft: (
    type: CommunicationDraftType,
    signal: GmailSignal | undefined,
    sourceHint?: string,
    interviewStartIso?: string | null,
  ) => void;
  savedJobsForAssign: SavedJobRow[];
  assignBusyKey: string | null;
  assignEmailToJob: (signal: GmailSignal, jobId: string) => void | Promise<void>;
  resolveMemoryItem: (
    text: string,
    source: "email" | "priority" | "risk" | "next_action" | "generic",
    emailResolution?: "junk" | "useful_action",
    emailSignal?: Pick<GmailSignal, "id" | "threadId">,
  ) => void | Promise<void>;
  pendingResolvedTexts: string[];
  onMarkEmailUnread: (signal: GmailSignal) => void | Promise<void>;
  gmailReadTogglePendingKey: string | null;
};

export function InboxEmailRow({
  g,
  emphasis,
  pendingCrossActionKeys,
  ignoredJobHuntMessageIds,
  onIgnoreJobHunt,
  runCrossSystemAction,
  communicationDraftLang,
  setCommunicationDraftLang,
  injectCommunicationDraft,
  savedJobsForAssign,
  assignBusyKey,
  assignEmailToJob,
  resolveMemoryItem,
  pendingResolvedTexts,
  onMarkEmailUnread,
  gmailReadTogglePendingKey,
}: InboxEmailRowProps) {
  const subject = g.subject || "(no subject)";
  const itemTooltip = [subject, g.snippet].filter(Boolean).join("\n\n");
  const importanceReason = typeof g.importance_reason === "string" ? g.importance_reason.trim() : "";
  const importanceScore =
    typeof g.importance_score === "number" ? Math.round(g.importance_score) : null;
  const messageId =
    g.id !== undefined && g.id !== null && String(g.id).trim() !== "" ? String(g.id).trim() : "";
  const threadKey =
    g.threadId !== undefined && g.threadId !== null && String(g.threadId).trim() !== ""
      ? String(g.threadId).trim()
      : "";
  const gmailToggleKey = messageId || threadKey;
  const isGmailUnread = gmailMessageIsUnread(g);
  const markUnreadBusy = Boolean(gmailToggleKey && gmailReadTogglePendingKey === gmailToggleKey);
  const emailToTaskKey = `email_to_task:${messageId}`;
  const emailToEventKey = `email_to_event:${messageId}`;
  const crossEmailBusy =
    pendingCrossActionKeys.includes(emailToTaskKey) || pendingCrossActionKeys.includes(emailToEventKey);
  const memoryBusy = pendingResolvedTexts.includes(subject);
  const badge = emphasis ? inboxPriorityBadge(g) : null;

  return (
    <li
      className={`list-card rounded-[22px] px-4 py-4 ${
        emphasis ? "border-l-[3px] border-amber-400/55 bg-amber-500/[0.07]" : ""
      } ${isGmailUnread ? "inbox-row-unread" : "inbox-row-read"} ${
        isGmailUnread && !emphasis ? "inbox-row-unread--fresh" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <span
            className={`mt-0.5 shrink-0 ${isGmailUnread ? "text-sky-400/95" : "text-zinc-500/80"}`}
            title={isGmailUnread ? "Unread in Gmail" : "Read in Gmail"}
            aria-label={isGmailUnread ? "Unread message" : "Read message"}
            role="img"
          >
            {isGmailUnread ? (
              <MailUnreadGlyph className="h-4 w-4" />
            ) : (
              <MailReadGlyph className="h-4 w-4" />
            )}
          </span>
          <p
            className={`line-clamp-2 text-sm leading-6 ${
              isGmailUnread ? "theme-ink font-semibold" : "theme-muted font-medium"
            }`}
            title={itemTooltip}
          >
            {subject}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isGmailUnread ? (
            <span
              className="signal-pill shrink-0 rounded-full bg-sky-500/25 px-2 py-0.5 text-[10px] font-semibold theme-ink ring-1 ring-sky-500/45"
              title="Unread in Gmail"
            >
              New
            </span>
          ) : null}
          {badge ? (
            <span
              className="signal-pill rounded-full px-2 py-0.5 text-[10px] font-semibold"
              title={badge === "Signals" ? "Job hunt or priority signal" : "High triage score"}
            >
              {badge}
            </span>
          ) : null}
        </div>
      </div>
      <p className="theme-accent mt-2 text-[11px] uppercase tracking-[0.14em]">{firstName(g.from)}</p>
      {importanceReason ? (
        <p className="theme-muted mt-2 text-[11px] leading-5">
          Triage intent: {importanceReason}
          {importanceScore !== null ? ` (${importanceScore}/100)` : ""}
        </p>
      ) : (
        <p className="theme-muted mt-2 text-[11px] leading-5 opacity-85">
          Triage intent: Ranking timed out or omitted by model
        </p>
      )}
      {g.snippet ? (
        <p className="theme-muted mt-2 line-clamp-2 text-sm leading-6" title={g.snippet}>
          {g.snippet}
        </p>
      ) : null}
      {messageId &&
      g.job_hunt_analysis &&
      g.job_hunt_analysis.confidence >= INBOX_JOB_HUNT_MIN_CONFIDENCE &&
      g.job_hunt_analysis.signals.length > 0 &&
      !ignoredJobHuntMessageIds.includes(messageId) ? (
        <div
          className="mt-3 rounded-[20px] border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-left"
          role="region"
          aria-label="Job hunt suggestions"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-200/90">Job hunt</p>
          <p className="theme-ink mt-1 text-sm font-medium leading-6">
            {formatJobHuntSignals(g.job_hunt_analysis.signals)}
          </p>
          <p className="theme-muted mt-1 text-xs leading-5">
            {jobHuntReasonCopy(g.job_hunt_analysis.signals[0] ?? "interview_request")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {g.job_hunt_analysis.suggestedActions.includes("create_prep_task") ? (
              <button
                type="button"
                disabled={
                  crossEmailBusy ||
                  memoryBusy ||
                  pendingCrossActionKeys.includes(`job_hunt_prep_tasks:${messageId}`)
                }
                onClick={() => void runCrossSystemAction("job_hunt_prep_tasks", messageId)}
                className="theme-button-primary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingCrossActionKeys.includes(`job_hunt_prep_tasks:${messageId}`)
                  ? "Prep tasks…"
                  : "Create prep tasks"}
              </button>
            ) : null}
            {g.job_hunt_analysis.suggestedActions.includes("suggest_calendar_block") ||
            g.job_hunt_analysis.suggestedActions.includes("create_interview_event") ? (
              <button
                type="button"
                disabled={!messageId || crossEmailBusy || memoryBusy}
                onClick={() => void runCrossSystemAction("email_to_event", messageId)}
                className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingCrossActionKeys.includes(emailToEventKey) ? "Calendar…" : "Add to calendar"}
              </button>
            ) : null}
            {g.job_hunt_analysis.suggestedActions.includes("create_followup_task") ? (
              <button
                type="button"
                disabled={!messageId || crossEmailBusy || memoryBusy}
                onClick={() => void runCrossSystemAction("email_to_task", messageId)}
                className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pendingCrossActionKeys.includes(emailToTaskKey) ? "Task…" : "Follow-up task"}
              </button>
            ) : null}
            {g.job_hunt_analysis.suggestedActions.includes("update_pipeline") ? (
              <Link
                href={buildJobHuntHref(g)}
                className="theme-button-secondary inline-flex items-center rounded-full px-3 py-2 text-xs font-semibold transition"
              >
                Update pipeline
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => onIgnoreJobHunt(messageId)}
              className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition"
            >
              Ignore
            </button>
          </div>
          <CommunicationDraftToolbar
            defaultDraftType="follow_up"
            lang={communicationDraftLang}
            onLangChange={setCommunicationDraftLang}
            onInject={(type) => injectCommunicationDraft(type, g, subject)}
          />
        </div>
      ) : null}
      <div className="mt-3">
        <label htmlFor={`assign-job-${messageId}`} className="theme-muted text-[11px]">Assign to saved job</label>
        <select
          id={`assign-job-${messageId}`}
          className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 focus-visible:ring-2 focus-visible:outline-none"
          defaultValue=""
          disabled={assignBusyKey !== null || savedJobsForAssign.length === 0}
          onChange={(e) => {
            const v = e.target.value;
            e.target.value = "";
            if (v) void assignEmailToJob(g, v);
          }}
        >
          <option value="">
            {savedJobsForAssign.length === 0
              ? "No saved jobs found"
              : assignBusyKey
                ? "Assigning..."
                : "Select a saved job..."}
          </option>
          {savedJobsForAssign.map((row) => {
            const jid = row.saved.job_id;
            const label = row.job?.company
              ? `${row.job.company} · ${row.job.title} (${row.lifecycle.stage})`
              : `${jid} (${row.lifecycle.stage})`;
            return (
              <option key={jid} value={jid}>
                {label}
              </option>
            );
          })}
        </select>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={!messageId || crossEmailBusy || memoryBusy}
          onClick={() => void runCrossSystemAction("email_to_task", messageId)}
          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          title="Create a Todoist task from this message (live Gmail read)"
        >
          {pendingCrossActionKeys.includes(emailToTaskKey) ? "Task…" : "To Todoist"}
        </button>
        <button
          type="button"
          disabled={!messageId || crossEmailBusy || memoryBusy}
          onClick={() => void runCrossSystemAction("email_to_event", messageId)}
          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          title="Add a calendar block when a reliable time is available"
        >
          {pendingCrossActionKeys.includes(emailToEventKey) ? "Event…" : "To Calendar"}
        </button>
        {isGmailUnread ? (
          <button
            type="button"
            disabled={pendingResolvedTexts.includes(subject)}
            onClick={() =>
              void resolveMemoryItem(subject, "email", "useful_action", {
                id: g.id,
                threadId: g.threadId,
              })
            }
            className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            title="Mark as read in Gmail and teach the assistant this kind of mail matters"
          >
            {pendingResolvedTexts.includes(subject) ? "Saving..." : "Mark as read"}
          </button>
        ) : (
          <button
            type="button"
            disabled={!gmailToggleKey || markUnreadBusy}
            onClick={() => void onMarkEmailUnread(g)}
            className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
            title="Mark as unread in Gmail"
          >
            {markUnreadBusy ? "Updating..." : "Mark as unread"}
          </button>
        )}
        <button
          type="button"
          disabled={pendingResolvedTexts.includes(subject)}
          onClick={() =>
            void resolveMemoryItem(subject, "email", "junk", {
              id: g.id,
              threadId: g.threadId,
            })
          }
          className="theme-button-secondary rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50"
          title="Not important — teach the AI to deprioritize similar mail"
        >
          {pendingResolvedTexts.includes(subject) ? "Saving..." : "Junk"}
        </button>
      </div>
    </li>
  );
}
