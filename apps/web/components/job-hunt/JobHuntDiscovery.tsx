"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { JobHuntListingRow, DigestPayload } from "@/lib/jobHuntUiTypes";
import { NEW_TRACK_SELECT_VALUE, myAssistJobTag } from "@/lib/jobHuntUiTypes";

type JobHuntContactPerson = {
  id: string;
  job_id: string;
  name?: string;
  phone?: string;
  email?: string;
  role?: string;
  company?: string;
  created_at: string;
};

type JobHuntLooseNote = { id: string; job_id: string; text: string; created_at: string };

function stagePill(stage: string): { label: string; className: string } {
  const s = stage.trim().toLowerCase();
  if (s === "lead") {
    return { label: "Saved", className: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/35" };
  }
  if (s === "applied") {
    return { label: "Applied", className: "bg-indigo-500/15 text-indigo-200 ring-1 ring-indigo-400/35" };
  }
  if (s === "waiting_call" || s === "interview_scheduled" || s === "interviewed") {
    return { label: "Interview", className: "bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/35" };
  }
  if (s === "offer") {
    return { label: "Offer", className: "bg-emerald-500/15 text-emerald-200 ring-1 ring-emerald-400/35" };
  }
  if (s === "closed_won") {
    return { label: "Closed won", className: "bg-emerald-600/20 text-emerald-100 ring-1 ring-emerald-400/40" };
  }
  if (s === "closed_lost") {
    return { label: "Closed", className: "bg-zinc-500/20 text-zinc-200 ring-1 ring-zinc-400/35" };
  }
  return { label: "Saved", className: "bg-sky-500/15 text-sky-200 ring-1 ring-sky-400/35" };
}

function isAppliedOrBeyond(stage: string): boolean {
  const s = stage.trim().toLowerCase();
  return (
    s === "applied" ||
    s === "waiting_call" ||
    s === "interview_scheduled" ||
    s === "interviewed" ||
    s === "offer" ||
    s === "closed_won" ||
    s === "closed_lost"
  );
}

export const RSS_FEED_KEYS: { key: string; label: string }[] = [
  { key: "JOB_HUNT_LINKEDIN_RSS_URLS", label: "LinkedIn" },
  { key: "JOB_HUNT_INDEED_RSS_URLS", label: "Indeed" },
  { key: "JOB_HUNT_RSS_FEEDS", label: "General RSS" },
  { key: "JOB_HUNT_WORKOPOLIS_RSS_URLS", label: "Workopolis" },
  { key: "JOB_HUNT_COMPANY_RSS_URLS", label: "Company career feeds" },
];

type Props = {
  digest: DigestPayload | null;
  rssLoading: boolean;
  rssError: string | null;
  rssFilePath: string | null;
  rssLines: Record<string, string>;
  rssCustom: Record<string, boolean>;
  rssSaveMsg: string | null;
  rssSaving: boolean;
  setRssLines: Dispatch<SetStateAction<Record<string, string>>>;
  setRssCustom: Dispatch<SetStateAction<Record<string, boolean>>>;
  saveRss: () => Promise<void>;
  loadRss: () => Promise<void>;
  manualJobQuery: string;
  setManualJobQuery: (v: string) => void;
  loadResolveCandidates: () => Promise<void>;
  manualResolveLoading: boolean;
  manualResolveError: string | null;
  manualResolveCandidates: JobHuntListingRow[];
  manualPickedId: string | null;
  setManualPickedId: (id: string | null) => void;
  manualNotes: string;
  setManualNotes: (v: string) => void;
  manualLookupTried: boolean;
  manualResolveFetched: boolean;
  manualResolveNotLinkedin: boolean;
  saveManualResolvedJob: () => Promise<void>;
  savingJobId: string | null;
  notesContactMsg: string | null;
  jobHuntContacts: { people: JobHuntContactPerson[]; loose_notes: JobHuntLooseNote[] } | null;
  jobHuntContactsLoading: boolean;
  jobs: JobHuntListingRow[];
  jobsLoading: boolean;
  jobsError: string | null;
  selectedTrack: string;
  setSelectedTrack: (t: string) => void;
  newTrackLabel: string;
  setNewTrackLabel: (v: string) => void;
  trackMenuOpen: boolean;
  setTrackMenuOpen: (v: boolean | ((o: boolean) => boolean)) => void;
  trackMenuRef: RefObject<HTMLDivElement | null>;
  trackOptions: { id: string; label: string; kind: string }[];
  trackButtonLabel: string;
  saveListingToPipeline: (jobId: string, notesOverride?: string, extractContactsFromNotes?: boolean) => Promise<void>;
  notesDraft: Record<string, string>;
  setNotesDraft: Dispatch<SetStateAction<Record<string, string>>>;
  savedJobIdSet: Set<string>;
  savedJobStageById: Record<string, string>;
  saveListError: string | null;
  pipelineRows: { key: string; title: string; sub: string }[];
  loading: boolean;
};

export function JobHuntDiscovery({
  digest,
  rssLoading,
  rssError,
  rssFilePath,
  rssLines,
  rssCustom,
  rssSaveMsg,
  rssSaving,
  setRssLines,
  setRssCustom,
  saveRss,
  loadRss,
  manualJobQuery,
  setManualJobQuery,
  loadResolveCandidates,
  manualResolveLoading,
  manualResolveError,
  manualResolveCandidates,
  manualPickedId,
  setManualPickedId,
  manualNotes,
  setManualNotes,
  manualLookupTried,
  manualResolveFetched,
  manualResolveNotLinkedin,
  saveManualResolvedJob,
  savingJobId,
  notesContactMsg,
  jobHuntContacts,
  jobHuntContactsLoading,
  jobs,
  jobsLoading,
  jobsError,
  selectedTrack,
  setSelectedTrack,
  newTrackLabel,
  setNewTrackLabel,
  trackMenuOpen,
  setTrackMenuOpen,
  trackMenuRef,
  trackOptions,
  trackButtonLabel,
  saveListingToPipeline,
  notesDraft,
  setNotesDraft,
  savedJobIdSet,
  savedJobStageById,
  saveListError,
  pipelineRows,
  loading,
}: Props) {
  return (
    <div className="space-y-6">
      <p className="theme-muted text-sm leading-7">
        Find new leads: RSS sources, resolve a posting by id, then save from the live feed. Track metrics by track still
        appear in the header summary.
      </p>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-4 sm:px-5">
        <p className="section-title text-xs font-semibold">By track (summary)</p>
        {pipelineRows.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {pipelineRows.map((row) => (
              <li key={row.key} className="list-card rounded-[16px] px-3 py-2 text-sm">
                <span className="font-semibold text-zinc-200">{row.title}</span>
                <span className="theme-muted"> — {row.sub}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="theme-muted mt-2 text-sm">
            {loading ? "Loading tracks…" : "No track data yet (digest server metrics)."}
          </p>
        )}
      </div>

      <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-4 py-4 sm:px-5">
        <p className="section-title text-xs font-semibold">RSS feed URLs</p>
        <p className="theme-muted mt-1 text-xs leading-5">
          Saved to <code className="rounded bg-white/5 px-1">rss-sources.json</code> next to the job-hunt store.
          Overrides <code className="rounded bg-white/5 px-1">JOB_HUNT_*</code> in the environment for the digest and
          MCP process. One URL per line. Turn on <strong className="theme-ink">Use custom list</strong> for LinkedIn and
          paste a job search URL.
        </p>
        {rssFilePath ? (
          <p className="theme-muted mt-2 break-all text-[11px] opacity-90">{rssFilePath}</p>
        ) : null}
        {rssLoading ? (
          <p className="theme-muted mt-3 text-sm">Loading RSS settings…</p>
        ) : (
          <div className="mt-4 space-y-4">
            {RSS_FEED_KEYS.map(({ key, label }) => (
              <div key={key} className="list-card rounded-[20px] px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="theme-ink text-sm font-medium" htmlFor={`rss-${key}`}>
                    {label}
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={Boolean(rssCustom[key])}
                      onChange={(e) => setRssCustom((prev) => ({ ...prev, [key]: e.target.checked }))}
                    />
                    Use custom list
                  </label>
                </div>
                <textarea
                  id={`rss-${key}`}
                  value={rssLines[key] ?? ""}
                  onChange={(e) => setRssLines((prev) => ({ ...prev, [key]: e.target.value }))}
                  disabled={!rssCustom[key]}
                  rows={3}
                  className="theme-muted mt-2 w-full resize-y rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-sm leading-6 outline-none ring-0 placeholder:text-zinc-500 disabled:opacity-50"
                  placeholder={
                    key === "JOB_HUNT_LINKEDIN_RSS_URLS"
                      ? "https://www.linkedin.com/jobs/search?keywords=…&geoId=…"
                      : "https://…"
                  }
                />
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void saveRss()}
                disabled={rssSaving}
                className="theme-button-primary rounded-full px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {rssSaving ? "Saving…" : "Save RSS sources"}
              </button>
              <button
                type="button"
                onClick={() => void loadRss()}
                className="theme-button-secondary rounded-full px-5 py-2.5 text-sm font-semibold"
              >
                Reload
              </button>
            </div>
            {rssError ? (
              <p className="text-sm text-rose-300" role="alert">
                {rssError}
              </p>
            ) : null}
            {rssSaveMsg ? <p className="text-sm text-emerald-200/90">{rssSaveMsg}</p> : null}
          </div>
        )}
      </div>

      <section
        id="job-hunt-add-by-id"
        className="glass-panel rounded-[28px] p-5 ring-1 ring-white/10"
      >
        <p className="section-title text-xs font-semibold">Add by job id or URL</p>
        <p className="theme-muted mt-1 text-xs leading-5">
          Searches the on-disk job index, then loads LinkedIn public job pages when missing. Track dropdown sets
          classification for newly fetched roles.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
            <span className="theme-muted">Id, numeric id, or URL substring</span>
            <input
              type="text"
              value={manualJobQuery}
              onChange={(e) => setManualJobQuery(e.target.value)}
              className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100"
              placeholder="e.g. 4384125483 or linkedin:https://..."
            />
          </label>
          <button
            type="button"
            onClick={() => void loadResolveCandidates()}
            disabled={manualResolveLoading || !manualJobQuery.trim()}
            className="theme-button-secondary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {manualResolveLoading ? "Searching…" : "Find or fetch"}
          </button>
        </div>
        {manualResolveError ? (
          <p className="mt-2 text-sm text-rose-300" role="alert">
            {manualResolveError}
          </p>
        ) : null}
        {manualResolveCandidates.length > 0 ? (
          <div className="mt-4 space-y-3">
            {manualResolveFetched ? (
              <p className="theme-muted text-xs">Loaded from LinkedIn into the job index — save below when ready.</p>
            ) : null}
            {manualResolveCandidates.length > 1 ? (
              <p className="theme-muted text-xs">Multiple matches — select the correct posting.</p>
            ) : null}
            <ul className="space-y-2">
              {manualResolveCandidates.map((j) => (
                <li key={j.id}>
                  <label className="flex cursor-pointer gap-3 rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-sm">
                    <input
                      type="radio"
                      name="manualPick"
                      checked={manualPickedId === j.id}
                      onChange={() => setManualPickedId(j.id)}
                      className="mt-1"
                    />
                    <span>
                      <span className="font-semibold text-zinc-100">{j.title}</span>
                      <span className="theme-muted"> · {j.company}</span>
                      <span className="theme-muted"> · {j.source}</span>
                      <br />
                      <span className="text-[11px] text-zinc-400">{j.id}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <label className="mt-2 block text-xs">
              <span className="theme-muted">Notes (optional)</span>
              <textarea
                value={manualNotes}
                onChange={(e) => setManualNotes(e.target.value)}
                rows={3}
                className="theme-muted mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
              />
              <span className="mt-1 block text-[10px] leading-4 text-zinc-500">
                Recruiter names, phone numbers, and emails are parsed from these notes into the contact list when saving
                (local Ollama when running; otherwise pattern match).
              </span>
            </label>
            <button
              type="button"
              disabled={!manualPickedId || savingJobId === manualPickedId}
              onClick={() => void saveManualResolvedJob()}
              className="theme-button-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {savingJobId === manualPickedId ? "Saving…" : "Save to my jobs"}
            </button>
          </div>
        ) : manualLookupTried && manualResolveCandidates.length === 0 && !manualResolveError ? (
          <div className="theme-muted mt-3 space-y-2 text-xs leading-5">
            {manualResolveNotLinkedin ? (
              <p>
                Online fetch only works for LinkedIn: paste a numeric job id (6+ digits), a{" "}
                <code className="rounded bg-white/5 px-1 text-[11px]">/jobs/view/…</code> URL, or{" "}
                <code className="rounded bg-white/5 px-1 text-[11px]">currentJobId</code> from LinkedIn search.
              </p>
            ) : (
              <p>
                No cached hit and the server could not parse this posting from LinkedIn (rate limit, bot wall, or markup
                changed). Retry later, paste the full job view URL, or use Latest listings so other roles populate the
                index.
              </p>
            )}
          </div>
        ) : null}
        {notesContactMsg ? (
          <p className="mt-4 text-sm text-sky-200/90" role="status">
            {notesContactMsg}
          </p>
        ) : null}
        <div className="mt-6 border-t border-white/10 pt-4">
          <p className="theme-accent text-[11px] uppercase tracking-[0.14em]">Contact list (from notes)</p>
          <p className="theme-muted mt-1 text-[10px] leading-4">
            Stored per signed-in account. File:{" "}
            <code className="rounded bg-white/5 px-1">.myassist-memory/users/&lt;id&gt;/job-hunt-contacts.json</code>
          </p>
          {jobHuntContactsLoading ? (
            <p className="theme-muted mt-2 text-xs">Loading contacts…</p>
          ) : jobHuntContacts && (jobHuntContacts.people.length > 0 || jobHuntContacts.loose_notes.length > 0) ? (
            <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-xs">
              {jobHuntContacts.people.map((p) => (
                <li key={p.id} className="rounded-lg border border-white/10 bg-black/15 px-3 py-2">
                  <span className="font-medium text-zinc-100">{p.name ?? "—"}</span>
                  {p.role ? <span className="theme-muted"> · {p.role}</span> : null}
                  {p.company ? <span className="theme-muted"> · {p.company}</span> : null}
                  <br />
                  <span className="text-zinc-400">
                    {[p.phone, p.email].filter(Boolean).join(" · ") || "—"}
                  </span>
                  <br />
                  <span className="text-[10px] text-zinc-500">Posting id · {p.job_id}</span>
                </li>
              ))}
              {jobHuntContacts.loose_notes.map((n) => (
                <li
                  key={n.id}
                  className="rounded-lg border border-white/5 bg-black/10 px-3 py-2 text-zinc-400 italic"
                >
                  {n.text}
                </li>
              ))}
            </ul>
          ) : (
            <p className="theme-muted mt-2 text-xs">
              Empty — after saving a role with notes here, contacts and extra comment lines appear here.
            </p>
          )}
        </div>
      </section>

      <section className="glass-panel rounded-[28px] p-5">
        <p className="section-title text-xs font-semibold">Latest job listings (Raw feed)</p>
        <p className="theme-muted mt-1 text-xs leading-5">
          Choose track, optional notes, then save. Copy the{" "}
          <code className="rounded bg-white/5 px-1 text-[11px]">[MA-JOB:…]</code> tag into emails or calendar invites for
          reliable matching. Tracks: {digest?.tracks?.map((t) => t.label).join(", ") ?? "AI focus, SAP bridge"}.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="theme-muted">Track for new saves</span>
            <div ref={trackMenuRef} className="theme-selector relative min-w-[220px]">
              <button
                type="button"
                onClick={() => setTrackMenuOpen((open) => !open)}
                aria-haspopup="listbox"
                aria-expanded={trackMenuOpen}
                className="inline-flex w-full min-w-[220px] items-center justify-between gap-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left text-sm text-zinc-100 transition hover:bg-black/35"
              >
                <span className="truncate">{trackButtonLabel}</span>
                <span aria-hidden className="shrink-0 text-zinc-400">
                  ▾
                </span>
              </button>
              {trackMenuOpen ? (
                <ul
                  role="listbox"
                  className="theme-menu absolute left-0 z-30 mt-2 max-h-64 w-full min-w-[220px] overflow-auto rounded-[22px] p-2 shadow-lg"
                >
                  {trackOptions.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={selectedTrack === t.id}
                        className={`theme-menu-item block w-full rounded-[16px] px-3 py-2.5 text-left text-sm transition ${
                          selectedTrack === t.id ? "theme-toggle is-active" : ""
                        }`}
                        onClick={() => {
                          setSelectedTrack(t.id);
                          setNewTrackLabel("");
                          setTrackMenuOpen(false);
                        }}
                      >
                        {t.label}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selectedTrack === NEW_TRACK_SELECT_VALUE}
                      className={`theme-menu-item block w-full rounded-[16px] px-3 py-2.5 text-left text-sm transition ${
                        selectedTrack === NEW_TRACK_SELECT_VALUE ? "theme-toggle is-active" : ""
                      }`}
                      onClick={() => {
                        setSelectedTrack(NEW_TRACK_SELECT_VALUE);
                        setTrackMenuOpen(false);
                      }}
                    >
                      New track…
                    </button>
                  </li>
                </ul>
              ) : null}
            </div>
          </label>
          {selectedTrack === NEW_TRACK_SELECT_VALUE ? (
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-xs">
              <span className="theme-muted">New track name (id is derived from this)</span>
              <input
                type="text"
                value={newTrackLabel}
                onChange={(e) => setNewTrackLabel(e.target.value)}
                className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-sm text-zinc-100"
                placeholder="e.g. Montreal startups"
              />
            </label>
          ) : null}
        </div>
        {saveListError ? (
          <p className="mt-3 text-sm text-rose-300" role="alert">
            {saveListError}
          </p>
        ) : null}
        <div className="mt-4">
          {jobsLoading ? (
            <p className="theme-muted text-sm">Loading jobs from configured sources…</p>
          ) : jobsError ? (
            <p className="text-sm text-rose-300">{jobsError}</p>
          ) : jobs.length > 0 ? (
            <div className="space-y-4">
              {jobs.map((job) => {
                const already = savedJobIdSet.has(job.id);
                const currentStage = savedJobStageById[job.id] ?? "";
                const stageBadge = already ? stagePill(currentStage || "lead") : null;
                const appliedBadge = already && isAppliedOrBeyond(currentStage);
                return (
                  <div key={job.id} className="list-card rounded-[22px] px-4 py-4">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="theme-ink text-base font-semibold hover:underline"
                        >
                          {job.title}
                        </a>
                        <p className="theme-muted mt-1 text-sm font-medium">
                          {job.company} {job.location ? `· ${job.location}` : ""} {job.remote ? "· Remote" : ""}
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0">
                        <span className="theme-chip rounded-full px-2 py-1 text-[10px] uppercase tracking-wider">
                          {job.source}
                        </span>
                        {stageBadge ? (
                          <span
                            className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${stageBadge.className}`}
                            title="Current pipeline status"
                          >
                            {stageBadge.label}
                          </span>
                        ) : null}
                        {already ? (
                          <span
                            className="rounded-full bg-sky-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-sky-100 ring-1 ring-sky-400/35"
                            title="Already saved in your jobs"
                          >
                            In My Jobs
                          </span>
                        ) : null}
                        {appliedBadge ? (
                          <span
                            className="rounded-full bg-indigo-500/20 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-indigo-100 ring-1 ring-indigo-400/40"
                            title="Already applied to this posting"
                          >
                            Applied
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {job.posted_date ? (
                      <p className="theme-muted mt-3 text-xs">Posted: {job.posted_date}</p>
                    ) : null}
                    <p className="theme-muted mt-2 text-[11px]">
                      <code className="rounded bg-black/30 px-1 py-0.5">{myAssistJobTag(job.id)}</code>
                      <button
                        type="button"
                        className="ml-2 text-sky-300 underline decoration-sky-500/50"
                        onClick={() => void navigator.clipboard.writeText(myAssistJobTag(job.id))}
                      >
                        Copy tag
                      </button>
                    </p>
                    <label className="mt-3 block text-xs">
                      <span className="theme-muted">Notes (optional)</span>
                      <textarea
                        value={notesDraft[job.id] ?? ""}
                        onChange={(e) =>
                          setNotesDraft((prev) => ({ ...prev, [job.id]: e.target.value }))
                        }
                        rows={2}
                        disabled={already}
                        className="theme-muted mt-1 w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none disabled:opacity-50"
                        placeholder="e.g. referral from Alex"
                      />
                    </label>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={already || savingJobId === job.id}
                        onClick={() => void saveListingToPipeline(job.id)}
                        className="theme-button-primary rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        {already ? "Saved" : savingJobId === job.id ? "Saving…" : "Save to my jobs"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="theme-muted text-sm">No jobs found in the feed. Check RSS URLs or try refreshing.</p>
          )}
        </div>
      </section>
    </div>
  );
}
