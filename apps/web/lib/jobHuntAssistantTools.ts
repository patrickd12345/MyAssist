import "server-only";

import type { AssistantReply } from "./assistant";
import { listJobHuntContactsFull } from "./jobHuntContactsStore";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";

function dataPath(): string | undefined {
  return resolveMyAssistRuntimeEnv().jobHuntDataPath || undefined;
}

function jobIdFromToken(raw: string): string {
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function maybeHandleJobHuntAssistantCommand(
  userId: string,
  message: string,
): Promise<AssistantReply | null> {
  const q = message.trim();
  if (!q) return null;

  const showPipeline = /(?:job hunt|pipeline).*(?:summary|status|snapshot)|show.*job hunt/i.test(q);
  if (showPipeline) {
    const { HuntService } = await import("job-hunt-manager/services/hunt-service");
    const svc = new HuntService(dataPath());
    const rows = await svc.listSavedJobs({});
    const top = rows
      .sort((a, b) => Date.parse(b.saved.saved_at) - Date.parse(a.saved.saved_at))
      .slice(0, 8);
    const lines = top.map((r) => {
      const label = r.job ? `${r.job.company} - ${r.job.title}` : r.saved.job_id;
      return `${label} (${r.lifecycle.stage})`;
    });
    return {
      mode: "fallback",
      answer: lines.length > 0 ? `Job hunt snapshot: ${lines.join("; ")}` : "No saved jobs yet in the pipeline.",
      actions: [
        "Open Job Hunt tab for full board",
        "Say 'job note <job_id>: <text>' to add a timeline note",
      ],
      followUps: ["Show follow_up stage jobs", "Who are my contacts at Stripe?"],
      taskDraft: null,
    };
  }

  const noteMatch = q.match(/job note\s+(.+?)\s*:\s*(.+)$/i);
  if (noteMatch) {
    const jobId = jobIdFromToken(noteMatch[1] ?? "");
    const detail = (noteMatch[2] ?? "").trim();
    if (!jobId || !detail) return null;
    const { HuntService } = await import("job-hunt-manager/services/hunt-service");
    const svc = new HuntService(dataPath());
    await svc.appendTimelineNote({ id: jobId, detail });
    return {
      mode: "fallback",
      answer: `Added a timeline note to ${jobId}.`,
      actions: ["Open Job Hunt and review the timeline", "Move stage if this note implies progression"],
      followUps: ["Update stage for this job", "Show latest touchpoints"],
      taskDraft: null,
    };
  }

  const stageMatch = q.match(/job stage\s+(.+?)\s+to\s+([a-z_]+)$/i);
  if (stageMatch) {
    const jobId = jobIdFromToken(stageMatch[1] ?? "");
    const stage = (stageMatch[2] ?? "").trim().toLowerCase();
    if (!jobId || !stage) return null;
    const { lifecycleStageSchema } = await import("job-hunt-manager/types/lifecycle");
    const parsed = lifecycleStageSchema.safeParse(stage);
    if (!parsed.success) {
      return {
        mode: "fallback",
        answer: `Unknown stage '${stage}'.`,
        actions: ["Use a valid lifecycle stage", "Open Job Hunt to pick stage from dropdown"],
        followUps: ["What stages are valid?"],
        taskDraft: null,
      };
    }
    const { HuntService } = await import("job-hunt-manager/services/hunt-service");
    const svc = new HuntService(dataPath());
    await svc.updateJobProgress({ id: jobId, stage: parsed.data });
    return {
      mode: "fallback",
      answer: `Updated ${jobId} to stage '${parsed.data}'.`,
      actions: ["Open Job Hunt to verify timeline update"],
      followUps: ["Add a follow-up note", "Show jobs in this stage"],
      taskDraft: null,
    };
  }

  const contactsMatch = q.match(/(?:job hunt\s+)?contacts?\s+(?:for|at|about)\s+(.+)$/i);
  if (contactsMatch) {
    const needle = (contactsMatch[1] ?? "").trim().toLowerCase();
    if (!needle) return null;
    const contacts = await listJobHuntContactsFull(userId);
    const matches = contacts.people
      .filter((p) =>
        [p.name, p.company, p.email, p.role]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(needle)),
      )
      .slice(0, 8);
    const summary = matches
      .map((p) => `${p.name ?? "(no name)"}${p.role ? ` (${p.role})` : ""}${p.company ? ` @ ${p.company}` : ""}`)
      .join("; ");
    return {
      mode: "fallback",
      answer: summary || `No contacts found for '${needle}'.`,
      actions: ["Open Job Hunt Contacts tab to view records"],
      followUps: ["Link a contact to a job", "Add a new contact"],
      taskDraft: null,
    };
  }

  return null;
}
