"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dailyContextFetchInit } from "@/lib/dailyContextClient";
import type { CalendarEvent, JobHuntEmailMatch } from "@/lib/types";
import type { SavedJobRow } from "@/lib/jobHuntUiTypes";
import { NEW_TRACK_SELECT_VALUE } from "@/lib/jobHuntUiTypes";
import { JobDetailsDrawer } from "./job-hunt/JobDetailsDrawer";
import { JobHuntContactsCRM } from "./job-hunt/JobHuntContactsCRM";
import { JobHuntDiscovery } from "./job-hunt/JobHuntDiscovery";
import { JobHuntPipeline } from "./job-hunt/JobHuntPipeline";

type DigestPayload = {
  generated_at?: string;
  followups_due_approx?: number;
  by_track?: Record<string, { saved: number; by_stage: Record<string, number> }>;
  tracks?: Array<{ id: string; label: string; kind: string }>;
};

type DigestApiOk = {
  ok: true;
  digestUrl: string;
  digest: DigestPayload;
};

type DigestApiFail = {
  ok: false;
  digestUrl: string;
  error: string;
};

function aggregateFromDigest(d: DigestPayload) {
  const byTrack = d.by_track ?? {};
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  let openLeads = 0;

  for (const row of Object.values(byTrack)) {
    const bs = row.by_stage ?? {};
    for (const [k, v] of Object.entries(bs)) {
      const n = typeof v === "number" ? v : 0;
      if (k === "applied") applied += n;
      if (k === "offer") offers += n;
      if (k === "lead") openLeads += n;
      if (k === "interview_scheduled" || k === "interviewed" || k === "waiting_call") {
        interviews += n;
      }
    }
  }

  const totalSaved = Object.values(byTrack).reduce((acc, row) => acc + (row.saved ?? 0), 0);

  return {
    totalSaved,
    applied,
    interviews,
    offers,
    openLeads,
    followups: typeof d.followups_due_approx === "number" ? d.followups_due_approx : 0,
  };
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="metric-chip rounded-[22px] px-4 py-4">
      <p className="theme-accent text-[11px] uppercase tracking-[0.18em]">{label}</p>
      <p className="theme-ink mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

/** Subset of job-hunt-manager UnifiedJob returned by GET /jobs on the digest server. */
type JobHuntListingRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  source: string;
  url: string;
  posted_date: string | null;
};

function parsePostedDateForSort(value: string | null): number {
  if (!value || !value.trim()) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

type TabId = "discovery" | "pipeline" | "contacts";

export function JobHuntCockpit() {
  const searchParams = useSearchParams();
  const handoffCompany = searchParams.get("company")?.trim() ?? "";
  const handoffRole = searchParams.get("role")?.trim() ?? "";
  const handoffStage = searchParams.get("stage")?.trim() ?? "";
  const handoffThreadId = searchParams.get("threadId")?.trim() ?? "";
  const handoffMessageId = searchParams.get("messageId")?.trim() ?? "";
  const handoffEventId = searchParams.get("eventId")?.trim() ?? "";
  const handoffRecruiter = searchParams.get("recruiter")?.trim() ?? "";
  const [activeTab, setActiveTab] = useState<TabId>("discovery");
  const [loading, setLoading] = useState(true);
  const [digestUrl, setDigestUrl] = useState<string | null>(null);
  const [digest, setDigest] = useState<DigestPayload | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [rssLoading, setRssLoading] = useState(true);
  const [rssError, setRssError] = useState<string | null>(null);
  const [rssFilePath, setRssFilePath] = useState<string | null>(null);
  const [rssLines, setRssLines] = useState<Record<string, string>>({});
  const [rssCustom, setRssCustom] = useState<Record<string, boolean>>({});
  const [rssSaveMsg, setRssSaveMsg] = useState<string | null>(null);
  const [rssSaving, setRssSaving] = useState(false);

  const [emailMatches, setEmailMatches] = useState<JobHuntEmailMatch[]>([]);
  const [emailMatchesLoading, setEmailMatchesLoading] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  const [savedJobs, setSavedJobs] = useState<SavedJobRow[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [selectedTrack, setSelectedTrack] = useState("ai_focus");
  const [trackMenuOpen, setTrackMenuOpen] = useState(false);
  const trackMenuRef = useRef<HTMLDivElement>(null);
  const [newTrackLabel, setNewTrackLabel] = useState("");
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingJobId, setSavingJobId] = useState<string | null>(null);
  const [saveListError, setSaveListError] = useState<string | null>(null);

  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);
  const [contactsRefreshKey, setContactsRefreshKey] = useState(0);

  const [manualJobQuery, setManualJobQuery] = useState("");
  const [manualResolveCandidates, setManualResolveCandidates] = useState<JobHuntListingRow[]>([]);
  const [manualResolveLoading, setManualResolveLoading] = useState(false);
  const [manualResolveError, setManualResolveError] = useState<string | null>(null);
  const [manualPickedId, setManualPickedId] = useState<string | null>(null);
  const [manualNotes, setManualNotes] = useState("");
  const [manualLookupTried, setManualLookupTried] = useState(false);
  const [manualResolveFetched, setManualResolveFetched] = useState(false);
  const [manualResolveNotLinkedin, setManualResolveNotLinkedin] = useState(false);
  const [notesContactMsg, setNotesContactMsg] = useState<string | null>(null);

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
  const [jobHuntContacts, setJobHuntContacts] = useState<{
    people: JobHuntContactPerson[];
    loose_notes: JobHuntLooseNote[];
  } | null>(null);
  const [jobHuntContactsLoading, setJobHuntContactsLoading] = useState(false);

  const [jobs, setJobs] = useState<JobHuntListingRow[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setJobsError(null);
    try {
      const res = await fetch("/api/job-hunt/search?track=ai_focus", { cache: "no-store" });
      if (!res.ok) {
        setJobsError(`Failed to fetch jobs: ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.ok && data.data && Array.isArray(data.data.jobs)) {
        const sorted = [...(data.data.jobs as JobHuntListingRow[])].sort((a, b) => {
          const tsA = parsePostedDateForSort(a.posted_date);
          const tsB = parsePostedDateForSort(b.posted_date);
          if (tsA !== tsB) return tsB - tsA;
          return String(a.id).localeCompare(String(b.id));
        });
        setJobs(sorted);
      } else {
        setJobsError(data.error || "No jobs returned");
      }
    } catch (e) {
      setJobsError(e instanceof Error ? e.message : "Failed to load jobs");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const loadEmailMatches = useCallback(async () => {
    setEmailMatchesLoading(true);
    try {
      const res = await fetch("/api/daily-context", dailyContextFetchInit());
      if (res.status === 401) {
        setEmailMatches([]);
        setCalendarEvents([]);
        return;
      }
      const ctx = (await res.json()) as {
        job_hunt_email_matches?: JobHuntEmailMatch[];
        calendar_today?: CalendarEvent[];
        error?: string;
      };
      if (ctx.error) {
        setEmailMatches([]);
        setCalendarEvents([]);
        return;
      }
      setEmailMatches(Array.isArray(ctx.job_hunt_email_matches) ? ctx.job_hunt_email_matches : []);
      setCalendarEvents(Array.isArray(ctx.calendar_today) ? ctx.calendar_today : []);
    } catch {
      setEmailMatches([]);
      setCalendarEvents([]);
    } finally {
      setEmailMatchesLoading(false);
    }
  }, []);

  const loadSavedJobs = useCallback(async () => {
    setSavedLoading(true);
    setSavedError(null);
    try {
      const res = await fetch("/api/job-hunt/saved", { cache: "no-store" });
      if (res.status === 401) {
        setSavedJobs([]);
        return;
      }
      const data = (await res.json()) as { ok?: boolean; jobs?: SavedJobRow[]; error?: string };
      if (!data.ok || !Array.isArray(data.jobs)) {
        setSavedError(data.error ?? "Could not load saved jobs.");
        setSavedJobs([]);
        return;
      }
      setSavedJobs(data.jobs);
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : "Saved jobs request failed.");
      setSavedJobs([]);
    } finally {
      setSavedLoading(false);
    }
  }, []);

  const loadResolveCandidates = useCallback(async () => {
    setManualResolveLoading(true);
    setManualResolveError(null);
    setManualResolveCandidates([]);
    setManualPickedId(null);
    setManualLookupTried(false);
    setManualResolveFetched(false);
    setManualResolveNotLinkedin(false);
    try {
      const qs = new URLSearchParams();
      const q = manualJobQuery.trim();
      if (q) qs.set("q", q);
      qs.set("fetch", "1");
      const trackForFetch = selectedTrack === NEW_TRACK_SELECT_VALUE ? "ai_focus" : selectedTrack;
      qs.set("track", trackForFetch);
      const res = await fetch(`/api/job-hunt/resolve?${qs.toString()}`, { cache: "no-store" });
      if (res.status === 401) {
        setManualResolveError("Sign in required.");
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        candidates?: JobHuntListingRow[];
        error?: string;
        fetched?: boolean;
        fetch_not_linkedin?: boolean;
      };
      if (!data.ok || !Array.isArray(data.candidates)) {
        setManualResolveError(data.error ?? "Lookup failed.");
        return;
      }
      setManualResolveCandidates(data.candidates);
      setManualResolveFetched(Boolean(data.fetched));
      setManualResolveNotLinkedin(Boolean(data.fetch_not_linkedin));
      setManualLookupTried(true);
      if (data.candidates.length === 1) setManualPickedId(data.candidates[0].id);
    } catch (e) {
      setManualResolveError(e instanceof Error ? e.message : "Lookup failed.");
    } finally {
      setManualResolveLoading(false);
    }
  }, [manualJobQuery, selectedTrack]);

  const loadRss = useCallback(async () => {
    setRssLoading(true);
    setRssError(null);
    setRssSaveMsg(null);
    try {
      const res = await fetch("/api/job-hunt/rss", { cache: "no-store" });
      if (res.status === 401) {
        setRssError("Sign in required to edit RSS sources.");
        return;
      }
      const body = (await res.json()) as
        | { ok: true; filePath: string; overrides: Record<string, string[]>; effective: Record<string, string[]> }
        | { ok?: false; error?: string };
      if (!("ok" in body) || !body.ok) {
        setRssError("error" in body && body.error ? body.error : "Could not load RSS settings.");
        return;
      }
      const data = body;
      setRssFilePath(data.filePath);
      const lines: Record<string, string> = {};
      const custom: Record<string, boolean> = {};
      for (const { key } of [
        { key: "JOB_HUNT_LINKEDIN_RSS_URLS" },
        { key: "JOB_HUNT_INDEED_RSS_URLS" },
        { key: "JOB_HUNT_RSS_FEEDS" },
        { key: "JOB_HUNT_WORKOPOLIS_RSS_URLS" },
        { key: "JOB_HUNT_COMPANY_RSS_URLS" },
      ]) {
        const eff = data.effective[key] ?? [];
        lines[key] = eff.join("\n");
        custom[key] = Object.prototype.hasOwnProperty.call(data.overrides, key);
      }
      setRssLines(lines);
      setRssCustom(custom);
    } catch (e) {
      setRssError(e instanceof Error ? e.message : "RSS settings request failed.");
    } finally {
      setRssLoading(false);
    }
  }, []);

  const saveRss = useCallback(async () => {
    setRssSaving(true);
    setRssSaveMsg(null);
    setRssError(null);
    try {
      const overrides: Record<string, string[] | null> = {};
      for (const key of [
        "JOB_HUNT_LINKEDIN_RSS_URLS",
        "JOB_HUNT_INDEED_RSS_URLS",
        "JOB_HUNT_RSS_FEEDS",
        "JOB_HUNT_WORKOPOLIS_RSS_URLS",
        "JOB_HUNT_COMPANY_RSS_URLS",
      ]) {
        if (!rssCustom[key]) {
          overrides[key] = null;
        } else {
          const raw = rssLines[key] ?? "";
          overrides[key] = raw
            .split(/\n/)
            .map((s) => s.trim())
            .filter(Boolean);
        }
      }
      const res = await fetch("/api/job-hunt/rss", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) {
        setRssError(body.error ?? `Save failed (${res.status})`);
        return;
      }
      setRssSaveMsg("Saved. Latest job listings refresh below; use Refresh digest for metrics + listings.");
      await loadRss();
      await loadJobs();
      await loadSavedJobs();
    } catch (e) {
      setRssError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setRssSaving(false);
    }
  }, [rssCustom, rssLines, loadRss, loadJobs, loadSavedJobs]);

  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/job-hunt/digest", { cache: "no-store" });
      if (res.status === 401) {
        setFetchError("Session expired. Sign in again.");
        setDigest(null);
        return;
      }
      const body = (await res.json()) as DigestApiOk | DigestApiFail | { error?: string };
      if ("error" in body && body.error && !("ok" in body)) {
        setFetchError(body.error);
        setDigest(null);
        return;
      }
      const typed = body as DigestApiOk | DigestApiFail;
      setDigestUrl(typed.digestUrl);
      if (typed.ok) {
        setDigest(typed.digest);
        setFetchError(null);
      } else {
        setDigest(null);
        setFetchError(typed.error);
      }
    } catch (e) {
      setDigest(null);
      setFetchError(e instanceof Error ? e.message : "Could not load digest.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadJobHuntContacts = useCallback(async () => {
    setJobHuntContactsLoading(true);
    try {
      const res = await fetch("/api/job-hunt/contacts?limit=25", { cache: "no-store" });
      if (res.status === 401) {
        setJobHuntContacts(null);
        return;
      }
      const data = (await res.json()) as {
        ok?: boolean;
        people?: JobHuntContactPerson[];
        loose_notes?: JobHuntLooseNote[];
      };
      if (!data.ok || !Array.isArray(data.people) || !Array.isArray(data.loose_notes)) {
        setJobHuntContacts(null);
        return;
      }
      setJobHuntContacts({ people: data.people, loose_notes: data.loose_notes });
    } catch {
      setJobHuntContacts(null);
    } finally {
      setJobHuntContactsLoading(false);
    }
  }, []);

  const saveListingToPipeline = useCallback(
    async (jobId: string, notesOverride?: string, extractContactsFromNotes?: boolean) => {
      setSaveListError(null);
      setNotesContactMsg(null);
      if (selectedTrack === NEW_TRACK_SELECT_VALUE) {
        const label = newTrackLabel.trim();
        if (!label) {
          setSaveListError("Enter a name for the new track.");
          return;
        }
      }
      setSavingJobId(jobId);
      try {
        const notes =
          notesOverride !== undefined ? notesOverride : notesDraft[jobId]?.trim() || undefined;
        const useNewTrack = selectedTrack === NEW_TRACK_SELECT_VALUE;
        const body: Record<string, unknown> = {
          id: jobId,
          notes: notes || undefined,
        };
        if (extractContactsFromNotes && notes?.trim()) {
          body.extract_contacts = true;
        }
        if (useNewTrack) {
          body.new_track = { label: newTrackLabel.trim() };
        } else {
          body.track = selectedTrack;
        }
        const res = await fetch("/api/job-hunt/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          saved?: { track?: string };
          contacts_extraction?: {
            people_added: number;
            loose_notes_added: number;
            parse_mode: string;
          };
        };
        if (!res.ok || !data.ok) {
          setSaveListError(data.error ?? `Save failed (${res.status})`);
          return;
        }
        const tr = data.saved && typeof data.saved.track === "string" ? data.saved.track : null;
        if (tr) {
          setSelectedTrack(tr);
          setNewTrackLabel("");
        }
        const cx = data.contacts_extraction;
        if (cx && (cx.people_added > 0 || cx.loose_notes_added > 0)) {
          const parts: string[] = [];
          if (cx.people_added > 0) parts.push(`${cx.people_added} contact${cx.people_added === 1 ? "" : "s"}`);
          if (cx.loose_notes_added > 0) parts.push(`${cx.loose_notes_added} note${cx.loose_notes_added === 1 ? "" : "s"}`);
          setNotesContactMsg(
            `Saved from notes: ${parts.join(", ")} (parsed with ${cx.parse_mode === "ollama" ? "local AI" : cx.parse_mode === "heuristic" ? "pattern match" : "no extraction"}).`,
          );
          void loadJobHuntContacts();
        }
        await Promise.all([loadSavedJobs(), load()]);
      } catch (e) {
        setSaveListError(e instanceof Error ? e.message : "Save failed.");
      } finally {
        setSavingJobId(null);
      }
    },
    [selectedTrack, newTrackLabel, notesDraft, loadSavedJobs, load, loadJobHuntContacts],
  );

  const saveManualResolvedJob = useCallback(async () => {
    if (!manualPickedId) return;
    const hasNotes = manualNotes.trim().length > 0;
    await saveListingToPipeline(manualPickedId, manualNotes.trim() || undefined, hasNotes);
    setManualResolveCandidates([]);
    setManualPickedId(null);
    setManualJobQuery("");
    setManualNotes("");
    setManualLookupTried(false);
  }, [manualPickedId, manualNotes, saveListingToPipeline]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const c = searchParams.get("contact")?.trim();
    if (c) setActiveTab("contacts");
    const tab = searchParams.get("tab")?.trim();
    if (tab === "pipeline") setActiveTab("pipeline");
  }, [searchParams]);

  useEffect(() => {
    void loadEmailMatches();
  }, [loadEmailMatches]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadSavedJobs();
  }, [loadSavedJobs]);

  useEffect(() => {
    void loadRss();
  }, [loadRss]);

  useEffect(() => {
    void loadJobHuntContacts();
  }, [loadJobHuntContacts]);

  useEffect(() => {
    if (!trackMenuOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (trackMenuRef.current && !trackMenuRef.current.contains(e.target as Node)) {
        setTrackMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTrackMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [trackMenuOpen]);

  const metrics = digest ? aggregateFromDigest(digest) : null;
  const weekLabel = digest?.generated_at
    ? `Week snapshot · updated ${new Date(digest.generated_at).toLocaleString()}`
    : "Week snapshot";

  const trackOptions =
    digest?.tracks?.length ?
      digest.tracks
    : [
        { id: "ai_focus", label: "AI focus", kind: "builtin" },
        { id: "sap_bridge", label: "SAP bridge", kind: "builtin" },
      ];

  const trackButtonLabel =
    selectedTrack === NEW_TRACK_SELECT_VALUE ?
      "New track…"
    : trackOptions.find((t) => t.id === selectedTrack)?.label ?? selectedTrack;

  const savedJobIdSet = new Set(savedJobs.map((r) => r.saved.job_id));
  const savedJobStageById = Object.fromEntries(
    savedJobs.map((row) => [row.saved.job_id, row.lifecycle.stage]),
  );

  const pipelineRows =
    digest?.tracks?.map((t) => {
      const row = digest.by_track?.[t.id];
      const saved = row?.saved ?? 0;
      const stages = row?.by_stage ?? {};
      const applied = stages.applied ?? 0;
      const iv =
        (stages.interview_scheduled ?? 0) +
        (stages.interviewed ?? 0) +
        (stages.waiting_call ?? 0);
      return {
        key: t.id,
        title: `${t.label}${t.kind === "user" ? " (custom)" : ""}`,
        sub: `Saved ${saved} · Applied ${applied} · Interview ${iv}`,
      };
    }) ?? [];

  const drawerRow = useMemo(() => {
    if (!drawerJobId) return null;
    return savedJobs.find((r) => r.saved.job_id === drawerJobId) ?? null;
  }, [drawerJobId, savedJobs]);

  const tabClass = (id: TabId) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      activeTab === id ? "theme-button-primary" : "theme-button-secondary"
    }`;

  return (
    <div className="theme-shell mx-auto min-h-screen w-full max-w-[1900px] px-4 py-6 sm:px-6 xl:px-8 2xl:px-10">
      <section className="glass-panel-strong mb-6 rounded-[32px] px-5 py-5 sm:px-7 sm:py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="signal-pill rounded-full px-3 py-1 text-[11px] font-semibold">
                MyAssist
              </span>
              <span className="theme-chip rounded-full px-3 py-1 text-xs font-medium">
                Plugin — separate from daily context
              </span>
            </div>
            <nav aria-label="Workspace" className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/"
                className="theme-button-secondary inline-flex rounded-full px-4 py-2 text-xs font-semibold transition"
              >
                Today
              </Link>
              <span
                className="theme-button-primary inline-flex rounded-full px-4 py-2 text-xs font-semibold"
                aria-current="page"
              >
                Job Hunt
              </span>
            </nav>
            <h1 className="theme-ink mt-4 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
              Job Hunt CRM
            </h1>
            <p className="theme-muted mt-2 max-w-3xl text-sm leading-7 sm:text-base">
              {weekLabel}. Three views: <strong className="theme-ink">Discovery</strong> (RSS + listings + add by id),{" "}
              <strong className="theme-ink">Pipeline</strong> (saved jobs by stage with detail drawer),{" "}
              <strong className="theme-ink">Contacts</strong> (rolodex). Metrics use the local{" "}
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">job-hunt-manager</code> digest (
              <code className="rounded bg-white/5 px-1.5 py-0.5 text-xs">pnpm job-hunt:digest:dev</code>).
            </p>
          </div>
          <div className="flex flex-col gap-3 xl:items-end">
            <Link
              href="/"
              className="theme-button-secondary inline-flex rounded-full px-5 py-3 text-sm font-semibold transition"
            >
              Back to MyAssist
            </Link>
            <button
              type="button"
              onClick={() =>
                void Promise.all([load(), loadEmailMatches(), loadJobs(), loadSavedJobs(), loadJobHuntContacts()])
              }
              disabled={loading || emailMatchesLoading || jobsLoading || savedLoading}
              className="theme-button-secondary rounded-full px-5 py-3 text-sm font-semibold transition disabled:opacity-50"
            >
              {loading || emailMatchesLoading || jobsLoading || savedLoading
                ? "Refreshing…"
                : "Refresh digest"}
            </button>
          </div>
        </div>

        {fetchError ? (
          <div
            role="status"
            className="mt-6 rounded-[24px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          >
            <p className="font-semibold">Digest server not reachable</p>
            <p className="mt-1 text-xs leading-6 opacity-95">
              {fetchError}. Start the digest on this machine:{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5">pnpm job-hunt:digest:dev</code>
              {digestUrl ? (
                <>
                  {" "}
                  (expected URL: <code className="rounded bg-black/30 px-1.5 py-0.5">{digestUrl}</code>)
                </>
              ) : null}
              . Override with <code className="rounded bg-black/30 px-1.5 py-0.5">JOB_HUNT_DIGEST_URL</code> in{" "}
              <code className="rounded bg-black/30 px-1.5 py-0.5">apps/web/.env.local</code>.
            </p>
          </div>
        ) : null}

        {emailMatches.length > 0 ? (
          <div
            className="mt-6 rounded-[28px] border border-emerald-500/25 bg-emerald-500/10 px-4 py-4 sm:px-5"
            id="job-hunt-inbox-matches"
          >
            <p className="section-title text-xs font-semibold text-emerald-200/90">Inbox ↔ saved roles</p>
            <p className="theme-muted mt-1 text-xs leading-5">
              From today&apos;s Gmail signals matched to saved leads.
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              {emailMatches.map((m, i) => (
                <li key={`${m.job_id}-${i}`} className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
                  <span className="font-medium text-zinc-100">{m.company}</span>
                  <span className="theme-muted"> — {m.signal.subject}</span>
                  {m.stage_updated ? (
                    <span className="ml-2 text-xs text-emerald-200/90">({m.stage_updated})</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {(handoffCompany ||
          handoffRole ||
          handoffStage ||
          handoffThreadId ||
          handoffMessageId ||
          handoffEventId) ? (
          <div
            className="mt-4 rounded-[22px] border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-xs leading-6 text-sky-100"
            role="status"
          >
            <p className="font-semibold text-sky-50">Handoff context from Inbox</p>
            <p className="mt-1">
              {[handoffCompany, handoffRole, handoffStage].filter(Boolean).join(" · ") || "Job context attached"}
            </p>
            <p className="opacity-90">
              {[
                handoffRecruiter ? `Recruiter: ${handoffRecruiter}` : "",
                handoffThreadId ? `Thread: ${handoffThreadId}` : "",
                handoffMessageId ? `Message: ${handoffMessageId}` : "",
                handoffEventId ? `Calendar event: ${handoffEventId}` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        ) : null}

        {!loading && !fetchError && metrics && metrics.totalSaved === 0 ? (
          <div
            className="mt-6 rounded-[24px] border border-sky-500/35 bg-sky-500/10 px-4 py-4 text-sm text-sky-100"
            role="note"
          >
            <p className="font-semibold text-sky-50">Pipeline is empty</p>
            <p className="mt-2 text-xs leading-6 opacity-95">
              Save roles from Discovery or MCP <code className="rounded bg-black/30 px-1.5 py-0.5">save_job</code>.
            </p>
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Saved roles" value={loading ? "…" : metrics?.totalSaved ?? "—"} />
          <MetricCard label="Applied" value={loading ? "…" : metrics?.applied ?? "—"} />
          <MetricCard label="Interviews" value={loading ? "…" : metrics?.interviews ?? "—"} />
          <MetricCard label="Offers" value={loading ? "…" : metrics?.offers ?? "—"} />
          <MetricCard label="Follow-ups due" value={loading ? "…" : metrics?.followups ?? "—"} />
        </div>

        <div className="mt-8 flex flex-wrap gap-2 border-t border-white/10 pt-6" role="tablist" aria-label="Job hunt views">
          <button type="button" role="tab" aria-selected={activeTab === "discovery"} className={tabClass("discovery")} onClick={() => setActiveTab("discovery")}>
            Discovery
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "pipeline"} className={tabClass("pipeline")} onClick={() => setActiveTab("pipeline")}>
            Pipeline
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "contacts"} className={tabClass("contacts")} onClick={() => setActiveTab("contacts")}>
            Contacts
          </button>
        </div>
      </section>

      {activeTab === "discovery" ? (
        <JobHuntDiscovery
          digest={digest}
          rssLoading={rssLoading}
          rssError={rssError}
          rssFilePath={rssFilePath}
          rssLines={rssLines}
          rssCustom={rssCustom}
          rssSaveMsg={rssSaveMsg}
          rssSaving={rssSaving}
          setRssLines={setRssLines}
          setRssCustom={setRssCustom}
          saveRss={saveRss}
          loadRss={loadRss}
          manualJobQuery={manualJobQuery}
          setManualJobQuery={setManualJobQuery}
          loadResolveCandidates={loadResolveCandidates}
          manualResolveLoading={manualResolveLoading}
          manualResolveError={manualResolveError}
          manualResolveCandidates={manualResolveCandidates}
          manualPickedId={manualPickedId}
          setManualPickedId={setManualPickedId}
          manualNotes={manualNotes}
          setManualNotes={setManualNotes}
          manualLookupTried={manualLookupTried}
          manualResolveFetched={manualResolveFetched}
          manualResolveNotLinkedin={manualResolveNotLinkedin}
          saveManualResolvedJob={saveManualResolvedJob}
          savingJobId={savingJobId}
          notesContactMsg={notesContactMsg}
          jobHuntContacts={jobHuntContacts}
          jobHuntContactsLoading={jobHuntContactsLoading}
          jobs={jobs}
          jobsLoading={jobsLoading}
          jobsError={jobsError}
          selectedTrack={selectedTrack}
          setSelectedTrack={setSelectedTrack}
          newTrackLabel={newTrackLabel}
          setNewTrackLabel={setNewTrackLabel}
          trackMenuOpen={trackMenuOpen}
          setTrackMenuOpen={setTrackMenuOpen}
          trackMenuRef={trackMenuRef}
          trackOptions={trackOptions}
          trackButtonLabel={trackButtonLabel}
          saveListingToPipeline={saveListingToPipeline}
          notesDraft={notesDraft}
          setNotesDraft={setNotesDraft}
          savedJobIdSet={savedJobIdSet}
          savedJobStageById={savedJobStageById}
          saveListError={saveListError}
          pipelineRows={pipelineRows}
          loading={loading}
        />
      ) : null}

      {activeTab === "pipeline" ? (
        <section className="glass-panel rounded-[28px] p-5">
          <JobHuntPipeline
            savedJobs={savedJobs}
            savedLoading={savedLoading}
            savedError={savedError}
            onOpenJob={(row) => {
              setDrawerJobId(row.saved.job_id);
            }}
          />
        </section>
      ) : null}

      {activeTab === "contacts" ? (
        <section className="glass-panel rounded-[28px] p-5">
          <JobHuntContactsCRM
            refreshKey={contactsRefreshKey}
            onContactsChanged={() => {
              void loadJobHuntContacts();
            }}
          />
        </section>
      ) : null}

      <JobDetailsDrawer
        row={drawerRow}
        open={Boolean(drawerJobId && drawerRow)}
        onClose={() => setDrawerJobId(null)}
        calendarEvents={calendarEvents}
        onRefreshSaved={loadSavedJobs}
        onContactsChanged={() => {
          void loadJobHuntContacts();
          setContactsRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}
