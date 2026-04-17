"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarEvent } from "@/lib/types";
import type { JobHuntPersonContact } from "@/lib/jobHuntContactTypes";
import { contactAppliesToJob } from "@/lib/jobHuntContactUtils";
import { lifecycleStageSchema, type LifecycleStage } from "job-hunt-manager/types/lifecycle";
import {
  formatLifecycleStageLabel,
  LIFECYCLE_STAGE_DEFINITIONS,
} from "@/lib/jobHuntStageDefinitions";
import { myAssistJobTag, type SavedJobRow } from "@/lib/jobHuntUiTypes";

const STAGE_OPTIONS = lifecycleStageSchema.options;

function calendarEventsForJob(jobId: string, company: string, events: CalendarEvent[]): CalendarEvent[] {
  const token = `[ma-job:${jobId.toLowerCase()}]`;
  const companyLc = company.trim().toLowerCase();
  return events.filter((e) => {
    const blob = `${e.summary} ${e.location ?? ""}`.toLowerCase();
    if (blob.includes(token)) return true;
    if (jobId.length > 3 && blob.includes(jobId.toLowerCase())) return true;
    if (companyLc.length > 2 && blob.includes(companyLc)) return true;
    return false;
  });
}

type Props = {
  row: SavedJobRow | null;
  open: boolean;
  onClose: () => void;
  calendarEvents: CalendarEvent[];
  onRefreshSaved: () => Promise<void>;
  /** Called after a contact is linked to this job so the Contacts tab can reload. */
  onContactsChanged?: () => void;
};

export function JobDetailsDrawer({
  row,
  open,
  onClose,
  calendarEvents,
  onRefreshSaved,
  onContactsChanged,
}: Props) {
  const [noteDraft, setNoteDraft] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [stageBusy, setStageBusy] = useState(false);
  const [stageErr, setStageErr] = useState<string | null>(null);
  /** Contact id for link/unlink/delete in progress, or "create" for new contact form. */
  const [contactOpBusy, setContactOpBusy] = useState<string | null>(null);
  const [contactSectionErr, setContactSectionErr] = useState<string | null>(null);
  const [allPeople, setAllPeople] = useState<JobHuntPersonContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    phone: "",
    role: "",
    company: "",
  });

  const jobId = row?.saved.job_id ?? "";
  const j = row?.job;
  const title = j?.title ?? jobId;
  const company = j?.company ?? "—";
  const url = j?.url ?? "";

  const loadContacts = useCallback(async () => {
    setContactsLoading(true);
    try {
      const res = await fetch("/api/job-hunt/contacts?full=1", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { ok?: boolean; people?: JobHuntPersonContact[] };
      if (data.ok && Array.isArray(data.people)) setAllPeople(data.people);
    } finally {
      setContactsLoading(false);
    }
  }, []);

  const refreshContactsAndNotify = useCallback(async () => {
    await loadContacts();
    await onRefreshSaved();
    onContactsChanged?.();
  }, [loadContacts, onRefreshSaved, onContactsChanged]);

  useEffect(() => {
    if (open && jobId) void loadContacts();
  }, [open, jobId, loadContacts]);

  useEffect(() => {
    if (!open) {
      setNewContact({ name: "", email: "", phone: "", role: "", company: "" });
      setContactSectionErr(null);
    }
  }, [open]);

  const assigned = useMemo(
    () => allPeople.filter((p) => contactAppliesToJob(p, jobId)),
    [allPeople, jobId],
  );

  const assignable = useMemo(
    () => allPeople.filter((p) => !contactAppliesToJob(p, jobId)),
    [allPeople, jobId],
  );

  const timeline = useMemo(() => {
    const ev = row?.lifecycle.timeline_events ?? [];
    return [...ev].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  }, [row?.lifecycle.timeline_events]);

  const cal = calendarEventsForJob(jobId, company, calendarEvents);

  const appendNote = async () => {
    const detail = noteDraft.trim();
    if (!detail || !jobId) return;
    setNoteBusy(true);
    setNoteErr(null);
    try {
      const res = await fetch(`/api/job-hunt/saved/${encodeURIComponent(jobId)}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ detail }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setNoteErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      setNoteDraft("");
      await onRefreshSaved();
    } catch (e) {
      setNoteErr(e instanceof Error ? e.message : String(e));
    } finally {
      setNoteBusy(false);
    }
  };

  const changeStage = async (stage: LifecycleStage) => {
    if (!jobId) return;
    setStageBusy(true);
    setStageErr(null);
    try {
      const res = await fetch(`/api/job-hunt/saved/${encodeURIComponent(jobId)}/stage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStageErr(data.error ?? `HTTP ${res.status}`);
        return;
      }
      await onRefreshSaved();
    } catch (e) {
      setStageErr(e instanceof Error ? e.message : String(e));
    } finally {
      setStageBusy(false);
    }
  };

  const linkContact = async (contactId: string) => {
    if (!jobId) return;
    setContactOpBusy(contactId);
    setContactSectionErr(null);
    try {
      const res = await fetch(`/api/job-hunt/saved/${encodeURIComponent(jobId)}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setContactSectionErr(data.error ?? "Link failed");
        return;
      }
      await refreshContactsAndNotify();
    } finally {
      setContactOpBusy(null);
    }
  };

  const unlinkContact = async (contactId: string) => {
    if (!jobId) return;
    setContactOpBusy(contactId);
    setContactSectionErr(null);
    try {
      const qs = new URLSearchParams({ contact_id: contactId });
      const res = await fetch(
        `/api/job-hunt/saved/${encodeURIComponent(jobId)}/contacts?${qs.toString()}`,
        { method: "DELETE" },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setContactSectionErr(data.error ?? "Could not remove from this job");
        return;
      }
      await refreshContactsAndNotify();
    } finally {
      setContactOpBusy(null);
    }
  };

  const deleteContactFromCrm = async (contactId: string) => {
    if (!globalThis.confirm("Delete this contact from the rolodex entirely? This cannot be undone.")) {
      return;
    }
    setContactOpBusy(contactId);
    setContactSectionErr(null);
    try {
      const res = await fetch(`/api/job-hunt/contacts/${encodeURIComponent(contactId)}`, {
        method: "DELETE",
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setContactSectionErr(data.error ?? "Delete failed");
        return;
      }
      await refreshContactsAndNotify();
    } finally {
      setContactOpBusy(null);
    }
  };

  const createContactAndLink = async () => {
    if (!jobId) return;
    const name = newContact.name.trim();
    const email = newContact.email.trim();
    const phone = newContact.phone.trim();
    if (!name && !email && !phone) {
      setContactSectionErr("Enter at least a name, email, or phone.");
      return;
    }
    setContactOpBusy("create");
    setContactSectionErr(null);
    try {
      const res = await fetch("/api/job-hunt/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: "",
          linked_job_ids: [jobId],
          name: name || undefined,
          email: email || undefined,
          phone: phone || undefined,
          role: newContact.role.trim() || undefined,
          company: newContact.company.trim() || undefined,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setContactSectionErr(data.error ?? "Could not create contact");
        return;
      }
      setNewContact({ name: "", email: "", phone: "", role: "", company: "" });
      await refreshContactsAndNotify();
    } finally {
      setContactOpBusy(null);
    }
  };

  if (!open || !row) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close job details"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        className="theme-shell fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-white/10 bg-zinc-950/95 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="job-drawer-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <h2 id="job-drawer-title" className="text-lg font-semibold text-zinc-100">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="hover:underline">
                  {title}
                </a>
              ) : (
                title
              )}
            </h2>
            <p className="theme-muted mt-1 text-sm">
              {company} · {row.saved.track}
            </p>
            <p className="theme-muted mt-2 text-[11px]">
              <code className="rounded bg-black/40 px-1 py-0.5">{myAssistJobTag(jobId)}</code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-sm text-zinc-300 hover:bg-white/5"
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <div>
            <p className="section-title text-[11px] font-semibold">Stage</p>
            <p className="theme-muted mt-1 text-[11px] leading-5">
              Hover an option in the list for its definition. The text below matches the saved stage.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={row.lifecycle.stage}
                disabled={stageBusy}
                onChange={(e) => void changeStage(e.target.value as LifecycleStage)}
                className="max-w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                aria-describedby="stage-definition"
              >
                {STAGE_OPTIONS.map((s) => (
                  <option key={s} value={s} title={LIFECYCLE_STAGE_DEFINITIONS[s]}>
                    {formatLifecycleStageLabel(s)}
                  </option>
                ))}
              </select>
              {stageBusy ? <span className="text-xs text-zinc-500">Updating…</span> : null}
            </div>
            <p
              id="stage-definition"
              className="theme-muted mt-2 border-l-2 border-sky-500/40 pl-3 text-xs leading-5 text-zinc-300"
            >
              <span className="font-medium text-zinc-200">{formatLifecycleStageLabel(row.lifecycle.stage)}: </span>
              {LIFECYCLE_STAGE_DEFINITIONS[row.lifecycle.stage]}
            </p>
            <details className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
              <summary className="cursor-pointer text-[11px] font-medium text-zinc-400">
                All stage definitions
              </summary>
              <dl className="mt-2 space-y-2 text-[11px] leading-5 text-zinc-400">
                {STAGE_OPTIONS.map((s) => (
                  <div key={s}>
                    <dt className="font-medium text-zinc-300">{formatLifecycleStageLabel(s)}</dt>
                    <dd className="mt-0.5 pl-0">{LIFECYCLE_STAGE_DEFINITIONS[s]}</dd>
                  </div>
                ))}
              </dl>
            </details>
            {stageErr ? (
              <p className="mt-2 text-xs text-rose-300" role="alert">
                {stageErr}
              </p>
            ) : null}
          </div>

          {typeof row.lifecycle.signing_probability === "number" ? (
            <div>
              <p className="section-title text-[11px] font-semibold">Signing probability</p>
              <p className="theme-muted mt-1 text-sm">
                {(row.lifecycle.signing_probability * 100).toFixed(0)}%
              </p>
            </div>
          ) : null}

          <div>
            <p className="section-title text-[11px] font-semibold">Timeline</p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto text-xs">
              {timeline.length === 0 ? (
                <li className="theme-muted">No events yet.</li>
              ) : (
                timeline.map((ev, i) => (
                  <li key={`${ev.at}-${i}`} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                    <span className="text-zinc-500">{new Date(ev.at).toLocaleString()}</span>
                    <span className="ml-2 text-zinc-400">[{ev.kind}]</span>
                    <p className="mt-1 text-zinc-200">{ev.detail}</p>
                  </li>
                ))
              )}
            </ul>
            <label className="mt-3 block text-xs">
              <span className="theme-muted">Add note</span>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                rows={3}
                className="theme-muted mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm"
                placeholder="e.g. Followed up on LinkedIn"
              />
            </label>
            <button
              type="button"
              disabled={noteBusy || !noteDraft.trim()}
              onClick={() => void appendNote()}
              className="theme-button-primary mt-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {noteBusy ? "Saving…" : "Append note"}
            </button>
            {noteErr ? (
              <p className="mt-2 text-xs text-rose-300" role="alert">
                {noteErr}
              </p>
            ) : null}
          </div>

          <div>
            <p className="section-title text-[11px] font-semibold">Email touchpoints</p>
            {row.touchpoints.length === 0 ? (
              <p className="theme-muted mt-1 text-xs">None yet (daily context → signals).</p>
            ) : (
              <ul className="mt-2 space-y-2 text-xs">
                {row.touchpoints.map((tp, i) => (
                  <li key={`${tp.at}-${i}`} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                    <span className="text-zinc-300">{tp.subject}</span>
                    <span className="theme-muted"> · {tp.at}</span>
                    {tp.body_summary ? <p className="theme-muted mt-1">{tp.body_summary}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <p className="section-title text-[11px] font-semibold">Calendar (today)</p>
            {cal.length === 0 ? (
              <p className="theme-muted mt-1 text-xs">No matches in today&apos;s snapshot.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-zinc-300">
                {cal.map((ev) => (
                  <li key={ev.id ?? `${ev.summary}-${ev.start}`}>
                    {ev.summary}
                    {ev.start ? ` · ${ev.start}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[20px] border border-white/10 bg-black/20 p-4">
            <p className="section-title text-[11px] font-semibold">Contacts on this job</p>
            <p className="theme-muted mt-1 text-[11px] leading-5">
              Remove only unlinks this posting. Delete removes the person from the rolodex everywhere.
            </p>
            {contactSectionErr ? (
              <p className="mt-2 text-xs text-rose-300" role="alert">
                {contactSectionErr}
              </p>
            ) : null}
            {contactsLoading ? (
              <p className="theme-muted mt-2 text-xs">Loading…</p>
            ) : assigned.length === 0 ? (
              <p className="theme-muted mt-2 text-xs">None linked yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {assigned.map((p) => {
                  const busy = contactOpBusy === p.id;
                  return (
                    <li key={p.id} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-zinc-100">{p.name ?? "—"}</span>
                          {p.role ? <span className="theme-muted"> · {p.role}</span> : null}
                          {p.company ? <span className="theme-muted"> · {p.company}</span> : null}
                          <br />
                          <span className="text-zinc-400">
                            {[p.email, p.phone].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void unlinkContact(p.id)}
                            className="rounded-lg border border-white/15 px-2 py-1 text-[11px] text-zinc-300 hover:bg-white/5 disabled:opacity-50"
                          >
                            {busy ? "…" : "Unlink job"}
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void deleteContactFromCrm(p.id)}
                            className="rounded-lg border border-rose-500/40 px-2 py-1 text-[11px] text-rose-200 hover:bg-rose-500/10 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="section-title mt-4 text-[11px] font-semibold">Add new contact for this job</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px]">
                <span className="theme-muted">Name</span>
                <input
                  value={newContact.name}
                  onChange={(e) => setNewContact((c) => ({ ...c, name: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[11px]">
                <span className="theme-muted">Email</span>
                <input
                  value={newContact.email}
                  onChange={(e) => setNewContact((c) => ({ ...c, email: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[11px]">
                <span className="theme-muted">Phone</span>
                <input
                  value={newContact.phone}
                  onChange={(e) => setNewContact((c) => ({ ...c, phone: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[11px]">
                <span className="theme-muted">Role</span>
                <input
                  value={newContact.role}
                  onChange={(e) => setNewContact((c) => ({ ...c, role: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-[11px] sm:col-span-2">
                <span className="theme-muted">Company</span>
                <input
                  value={newContact.company}
                  onChange={(e) => setNewContact((c) => ({ ...c, company: e.target.value }))}
                  className="mt-0.5 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-sm"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={contactOpBusy === "create"}
              onClick={() => void createContactAndLink()}
              className="theme-button-primary mt-3 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {contactOpBusy === "create" ? "Saving…" : "Create & link to this job"}
            </button>

            <p className="theme-muted mt-4 text-[11px]">Link existing CRM contact</p>
            {assignable.length === 0 && !contactsLoading ? (
              <p className="theme-muted mt-1 text-xs">All contacts are already linked, or CRM is empty.</p>
            ) : (
              <select
                className="mt-2 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-zinc-100"
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value;
                  e.target.value = "";
                  if (v) void linkContact(v);
                }}
                disabled={Boolean(contactOpBusy)}
              >
                <option value="">Select contact to link…</option>
                {assignable.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.email ?? p.id}
                  </option>
                ))}
              </select>
            )}
          </div>

          {row.saved.notes ? (
            <div>
              <p className="section-title text-[11px] font-semibold">Saved notes</p>
              <p className="theme-muted mt-1 text-sm leading-6">{row.saved.notes}</p>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
