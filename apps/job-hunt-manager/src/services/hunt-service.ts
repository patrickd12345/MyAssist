import { aggregateRawJobs } from "../core/aggregate.js";
import { dedupeJobs } from "../core/dedupe.js";
import { applyDomainFilters, applyQueryFilters, type SearchFilters } from "../core/filter.js";
import { rawToUnified } from "../core/normalize.js";
import { rankJobs } from "../core/rank.js";
import { resolveJobCandidatesInIndex } from "../core/resolve-job.js";
import { annotateTrackGuess } from "../core/track-classifier.js";
import { computeSigningProbability } from "../core/probability.js";
import {
  compareMatchTieBreak,
  extractJobIdFromMyAssistTag,
  inferStageFromEmailText,
  matchEmailToJob,
  roleTokenOverlapForJob,
  signalFingerprint,
  subjectTokenOverlapForJob,
  shouldAdvanceStage,
} from "../core/email-job-match.js";
import { extractTranscriptSignals } from "../core/transcript-signals.js";
import {
  buildLinkedInViewUrlFromQuery,
  fetchLinkedInRawJobFromViewPage,
} from "../connectors/linkedin-job-view.js";
import { loadState, saveState, type PersistedStateV1 } from "../store/file-store.js";
import type { UnifiedJob } from "../types/job.js";
import {
  lifecycleStageSchema,
  type EmailSignalInput,
  type LifecycleStage,
  type LifecycleState,
  type SavedLead,
  type TouchpointRecord,
  type TranscriptRecord,
} from "../types/lifecycle.js";
import {
  builtinTracks,
  type NewTrackInput,
  newTrackInputSchema,
  slugifyTrackLabel,
  type TrackDefinition,
} from "../types/tracks.js";

export class HuntService {
  constructor(private readonly dataPath?: string) {}

  private async load(): Promise<PersistedStateV1> {
    return loadState(this.dataPath);
  }

  private async persist(s: PersistedStateV1): Promise<void> {
    await saveState(s, this.dataPath);
  }

  mergedTracks(state: PersistedStateV1, includeArchived = false): TrackDefinition[] {
    const user = state.userTracks.filter((t) => includeArchived || !t.archived);
    const built = builtinTracks();
    return [...built, ...user];
  }

  getTrack(state: PersistedStateV1, trackId: string): TrackDefinition | undefined {
    return this.mergedTracks(state, true).find((t) => t.id === trackId);
  }

  async createTrack(input: NewTrackInput): Promise<TrackDefinition> {
    const parsed = newTrackInputSchema.parse(input);
    const state = await this.load();
    const id = parsed.id ?? slugifyTrackLabel(parsed.label);
    if (this.getTrack(state, id)) {
      throw new Error(`Track id already exists: ${id}. Use list_tracks or pick another id.`);
    }
    const t: TrackDefinition = {
      id,
      label: parsed.label,
      kind: "user",
      default_keywords: parsed.default_keywords ?? [],
      job_type_hint: parsed.job_type_hint,
      notes: parsed.notes,
    };
    state.userTracks.push(t);
    await this.persist(state);
    return t;
  }

  async archiveTrack(trackId: string): Promise<void> {
    const state = await this.load();
    const bt = builtinTracks().some((b) => b.id === trackId);
    if (bt) {
      throw new Error(`Cannot archive built-in track: ${trackId}`);
    }
    const u = state.userTracks.find((x) => x.id === trackId);
    if (!u) throw new Error(`Unknown track: ${trackId}`);
    u.archived = true;
    await this.persist(state);
  }

  async listTracks(includeArchived = false): Promise<TrackDefinition[]> {
    const state = await this.load();
    return this.mergedTracks(state, includeArchived);
  }

  async resolveTrackOnSave(
    state: PersistedStateV1,
    track?: string,
    newTrack?: NewTrackInput,
  ): Promise<string> {
    if (newTrack) {
      const created = await this.createTrack(newTrack);
      return created.id;
    }
    if (!track) {
      throw new Error("Provide track or new_track when saving.");
    }
    if (!this.getTrack(state, track)) {
      throw new Error(`Unknown track: ${track}. Use list_tracks or create_track.`);
    }
    return track;
  }

  async searchJobs(args: {
    track: string;
    keywords?: string;
    location?: string;
    remote?: boolean;
    job_type?: "permanent" | "contract" | "either";
    seniority?: string;
    filters?: SearchFilters;
    limit?: number;
    /**
     * `relevance` (default): rank by track keywords + heuristics (MCP-friendly).
     * `feed`: preserve connector order (LinkedIn guest API page order) for parity with the configured search URL.
     */
    sort?: "relevance" | "feed";
  }): Promise<{
    query: Record<string, unknown>;
    total_deduped: number;
    returned: number;
    jobs: UnifiedJob[];
  }> {
    const state = await this.load();
    const tr = this.getTrack(state, args.track);
    if (!tr) {
      throw new Error(`Unknown track: ${args.track}. Use list_tracks or create_track.`);
    }

    const keywordParts = [
      ...tr.default_keywords,
      args.keywords?.trim() ?? "",
      args.location?.trim() ?? "",
      args.seniority?.trim() ?? "",
    ].filter(Boolean);

    const keywordQuery = keywordParts.join(" ");

    let rawList = await aggregateRawJobs();

    if (rawList.length === 0 && process.env.JOB_HUNT_DEMO_JOBS === "true") {
      rawList = demoRawJobs();
    }

    let unified = rawList.map((r) => rawToUnified(r));

    let jobTypeFilter: "permanent" | "contract" | "either" | undefined;
    if (args.job_type && args.job_type !== "either") {
      jobTypeFilter = args.job_type;
    } else if (tr.job_type_hint && tr.job_type_hint !== "either") {
      jobTypeFilter = tr.job_type_hint;
    }

    unified = applyQueryFilters(unified, {
      remote: args.remote,
      job_type: jobTypeFilter,
    });
    unified = applyDomainFilters(unified, args.filters);

    const deduped = dedupeJobs(unified);
    const tracks = this.mergedTracks(state);
    const annotated = deduped.map((j) => {
      const a = annotateTrackGuess({ ...j, track: args.track }, tracks);
      return { ...a, track: args.track };
    });
    const sortMode = args.sort ?? "relevance";
    const ranked =
      sortMode === "feed"
        ? annotated
        : rankJobs(annotated, keywordQuery, tr.default_keywords);
    const lim = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const slice = ranked.slice(0, lim);

    const fresh = await this.load();
    const next: PersistedStateV1 = {
      ...fresh,
      jobIndex: { ...fresh.jobIndex },
    };
    for (const j of slice) {
      next.jobIndex[j.id] = { ...j };
    }
    await this.persist(next);

    return {
      query: {
        track: args.track,
        keywords: args.keywords ?? null,
        location: args.location ?? null,
        remote: args.remote ?? null,
        job_type: jobTypeFilter ?? null,
        seniority: args.seniority ?? null,
        filters: args.filters ?? null,
        limit: lim,
        sort: sortMode,
      },
      total_deduped: deduped.length,
      returned: slice.length,
      jobs: slice.map(publicJob),
    };
  }

  async getJob(id: string): Promise<{
    job: UnifiedJob | null;
    lifecycle: LifecycleState | null;
    transcripts: TranscriptRecord[];
    touchpoints: TouchpointRecord[];
  }> {
    const state = await this.load();
    const job = state.jobIndex[id] ?? null;
    return {
      job: job ? publicJob(job) : null,
      lifecycle: state.lifecycle[id] ?? null,
      transcripts: state.transcripts[id] ?? [],
      touchpoints: state.touchpoints[id] ?? [],
    };
  }


  /** Match cached jobs by canonical id, URL substring, or LinkedIn-style numeric id (e.g. currentJobId). */
  async resolveJobCandidates(raw: string): Promise<UnifiedJob[]> {
    const state = await this.load();
    return resolveJobCandidatesInIndex(state.jobIndex, raw).map((j) => publicJob(j));
  }

  /**
   * When the job is not in the index, fetch the public LinkedIn job view page and merge into `jobIndex`.
   * Returns `null` if the URL cannot be parsed as a LinkedIn view, or HTML could not be parsed.
   * Throws if `trackId` is unknown.
   */
  async tryIngestLinkedInJobFromQuery(raw: string, trackId: string): Promise<UnifiedJob | null> {
    const viewUrl = buildLinkedInViewUrlFromQuery(raw);
    if (!viewUrl) return null;
    const state = await this.load();
    if (!this.getTrack(state, trackId)) {
      throw new Error(`Unknown track: ${trackId}. Use list_tracks or create_track.`);
    }
    const rawJob = await fetchLinkedInRawJobFromViewPage(viewUrl);
    if (!rawJob) return null;
    const unified = rawToUnified(rawJob);
    const tracks = this.mergedTracks(state);
    const annotated = annotateTrackGuess({ ...unified, track: trackId }, tracks);
    const fresh = await this.load();
    const next: PersistedStateV1 = {
      ...fresh,
      jobIndex: { ...fresh.jobIndex, [annotated.id]: annotated },
    };
    await this.persist(next);
    return publicJob(annotated);
  }

  async saveJob(input: {
    id: string;
    track?: string;
    new_track?: NewTrackInput;
    notes?: string;
    bucket?: string;
    bridge_pitch?: string;
  }): Promise<SavedLead> {
    let state = await this.load();
    const trackId = await this.resolveTrackOnSave(state, input.track, input.new_track);
    state = await this.load();
    const job = state.jobIndex[input.id];
    if (!job) {
      throw new Error(
        `Unknown job id: ${input.id}. Resolve it first (GET /resolve-job?q=…&fetch=1) to load LinkedIn postings that are not in the digest cache yet.`,
      );
    }
    const saved: SavedLead = {
      job_id: input.id,
      track: trackId,
      notes: input.notes,
      bucket: input.bucket,
      bridge_pitch: input.bridge_pitch,
      saved_at: new Date().toISOString(),
    };
    state.saved[input.id] = saved;
    const existing = state.lifecycle[input.id];
    const lifecycle: LifecycleState = existing ?? {
      job_id: input.id,
      track: trackId,
      stage: "lead",
      interview_transcript_refs: [],
      timeline_events: [],
    };
    lifecycle.track = trackId;
    if (input.bridge_pitch) lifecycle.bridge_pitch = input.bridge_pitch;
    lifecycle.timeline_events = [
      ...lifecycle.timeline_events,
      { at: new Date().toISOString(), kind: "saved", detail: `Saved to track ${trackId}` },
    ];
    state.lifecycle[input.id] = lifecycle;
    await this.persist(state);
    return saved;
  }

  async markApplied(input: {
    id: string;
    applied_date: string;
    channel?: string;
    notes?: string;
  }): Promise<LifecycleState> {
    const state = await this.load();
    const saved = state.saved[input.id];
    if (!saved) {
      throw new Error(`Save the job before mark_applied: ${input.id}`);
    }
    const lc = state.lifecycle[input.id];
    if (!lc) throw new Error(`Missing lifecycle for ${input.id}`);
    const at = Date.parse(input.applied_date);
    if (Number.isNaN(at)) throw new Error("Invalid applied_date (ISO expected)");
    const base = new Date(at);
    const d3 = new Date(base);
    d3.setUTCDate(d3.getUTCDate() + 3);
    const d7 = new Date(base);
    d7.setUTCDate(d7.getUTCDate() + 7);
    const d14 = new Date(base);
    d14.setUTCDate(d14.getUTCDate() + 14);
    lc.stage = "applied";
    lc.applied_at = new Date(at).toISOString();
    lc.followups = {
      d3: d3.toISOString(),
      d7: d7.toISOString(),
      d14: d14.toISOString(),
    };
    lc.timeline_events.push({
      at: new Date().toISOString(),
      kind: "applied",
      detail: [input.channel, input.notes].filter(Boolean).join(" | ") || "Marked applied",
    });
    state.lifecycle[input.id] = lc;
    await this.persist(state);
    return lc;
  }

  async listSavedJobs(input: {
    track?: string;
    status?: LifecycleState["stage"];
    source?: UnifiedJob["source"];
    type?: UnifiedJob["type"];
    only_followup_due?: boolean;
  }): Promise<
    Array<{
      saved: SavedLead;
      job: UnifiedJob | null;
      lifecycle: LifecycleState;
      touchpoints: TouchpointRecord[];
    }>
  > {
    const state = await this.load();
    const out: Array<{
      saved: SavedLead;
      job: UnifiedJob | null;
      lifecycle: LifecycleState;
      touchpoints: TouchpointRecord[];
    }> = [];
    const now = Date.now();
    for (const sid of Object.keys(state.saved)) {
      const saved = state.saved[sid];
      if (!saved) continue;
      if (input.track && saved.track !== input.track) continue;
      const job = state.jobIndex[sid] ?? null;
      const lifecycle = state.lifecycle[sid];
      if (!lifecycle) continue;
      if (input.status && lifecycle.stage !== input.status) continue;
      if (input.source && job && job.source !== input.source) continue;
      if (input.type && job && job.type !== input.type) continue;
      if (input.only_followup_due) {
        const due = lifecycle.followups?.d3 ? Date.parse(lifecycle.followups.d3) : null;
        const tps = state.touchpoints[sid] ?? [];
        const lastOut = [...tps].reverse().find((t) => t.direction === "outgoing");
        const stale =
          lifecycle.stage === "applied" &&
          due !== null &&
          now > due &&
          (!lastOut || Date.parse(lastOut.at) < due);
        if (!stale) continue;
      }
      out.push({
        saved,
        job: job ? publicJob(job) : null,
        lifecycle,
        touchpoints: [...(state.touchpoints[sid] ?? [])].sort(
          (a, b) => Date.parse(b.at) - Date.parse(a.at),
        ),
      });
    }
    return out;
  }

  /** Append a user note to the job timeline (does not change stage). */
  async appendTimelineNote(input: { id: string; detail: string }): Promise<LifecycleState> {
    const detail = input.detail.trim();
    if (!detail) throw new Error("Note detail is required");
    const state = await this.load();
    const lc = state.lifecycle[input.id];
    if (!lc) throw new Error(`No lifecycle for ${input.id}. save_job first.`);
    lc.timeline_events.push({
      at: new Date().toISOString(),
      kind: "note",
      detail,
    });
    state.lifecycle[input.id] = lc;
    await this.persist(state);
    return lc;
  }

  async updateJobProgress(input: {
    id: string;
    stage: string;
    next_action?: string;
    next_action_date?: string;
    notes?: string;
    track?: string;
    new_track?: NewTrackInput;
  }): Promise<LifecycleState> {
    let state = await this.load();
    const lc = state.lifecycle[input.id];
    if (!lc) throw new Error(`No lifecycle for ${input.id}. save_job first.`);
    const stage = lifecycleStageSchema.parse(input.stage);
    let trackId = lc.track;
    if (input.new_track || input.track) {
      trackId = await this.resolveTrackOnSave(state, input.track, input.new_track);
      state = await this.load();
    }
    lc.stage = stage;
    lc.track = trackId;
    if (input.next_action !== undefined) lc.next_action = input.next_action;
    if (input.next_action_date !== undefined) lc.next_action_date = input.next_action_date;
    lc.timeline_events.push({
      at: new Date().toISOString(),
      kind: "stage",
      detail: [stage, input.notes].filter(Boolean).join(" | "),
    });
    if (state.saved[input.id]) {
      state.saved[input.id].track = trackId;
    }
    state.lifecycle[input.id] = lc;
    await this.persist(state);
    return lc;
  }

  async addInterviewTranscript(input: {
    id: string;
    transcript_text?: string;
    transcript_ref?: string;
    interview_round?: string;
    summary?: string;
  }): Promise<TranscriptRecord> {
    const state = await this.load();
    if (!state.lifecycle[input.id]) throw new Error(`No lifecycle for ${input.id}`);
    const text = input.transcript_text ?? "";
    const signals = text.length > 40 ? extractTranscriptSignals(text) : undefined;
    const rec: TranscriptRecord = {
      id: `tr_${Date.now().toString(36)}`,
      at: new Date().toISOString(),
      interview_round: input.interview_round,
      summary: input.summary,
      transcript_ref: input.transcript_ref,
      transcript_text: input.transcript_text,
      signals,
    };
    const list = state.transcripts[input.id] ?? [];
    list.push(rec);
    state.transcripts[input.id] = list;
    const lc = state.lifecycle[input.id];
    lc.interview_transcript_refs.push(rec.id);
    lc.timeline_events.push({
      at: rec.at,
      kind: "transcript",
      detail: `Interview ${input.interview_round ?? ""}`.trim(),
    });
    await this.persist(state);
    return rec;
  }

  async logTouchpoint(input: {
    id: string;
    channel: TouchpointRecord["channel"];
    direction: TouchpointRecord["direction"];
    subject: string;
    body_summary?: string;
    signal_ref?: string;
  }): Promise<TouchpointRecord> {
    const state = await this.load();
    if (!state.lifecycle[input.id]) throw new Error(`No lifecycle for ${input.id}`);
    const tp: TouchpointRecord = {
      at: new Date().toISOString(),
      channel: input.channel,
      direction: input.direction,
      subject: input.subject,
      body_summary: input.body_summary,
      signal_ref: input.signal_ref,
    };
    const list = state.touchpoints[input.id] ?? [];
    list.push(tp);
    state.touchpoints[input.id] = list;
    state.lifecycle[input.id].last_touchpoint_at = tp.at;
    await this.persist(state);
    return tp;
  }

  async scoreSigningProbability(input: { id: string; override_signals?: { delta?: number } }): Promise<{
    score: number;
    factors: string[];
    lifecycle: LifecycleState;
  }> {
    const state = await this.load();
    const lc = state.lifecycle[input.id];
    if (!lc) throw new Error(`No lifecycle for ${input.id}`);
    const tps = state.touchpoints[input.id] ?? [];
    const { score, factors } = computeSigningProbability({
      stage: lc.stage,
      touchpoints: tps,
      applied_at: lc.applied_at,
      override_delta: input.override_signals?.delta,
    });
    lc.signing_probability = score;
    lc.probability_factors = factors;
    state.lifecycle[input.id] = lc;
    await this.persist(state);
    return { score, factors, lifecycle: lc };
  }

  /**
   * Match Gmail-style signals to saved jobs; log incoming email touchpoints and optionally advance lifecycle.
   */
  async processEmailSignals(signals: EmailSignalInput[]): Promise<{
    processed: number;
    matches: Array<{
      job_id: string;
      company: string;
      title: string;
      match_score: number;
      match_reason: string;
      signal: EmailSignalInput;
      touchpoint_logged: boolean;
      stage_updated?: LifecycleStage;
    }>;
  }> {
    const state = await this.load();
    const matches: Array<{
      job_id: string;
      company: string;
      title: string;
      match_score: number;
      match_reason: string;
      signal: EmailSignalInput;
      touchpoint_logged: boolean;
      stage_updated?: LifecycleStage;
    }> = [];

    for (const signal of signals) {
      if (!signal.from?.trim() || !signal.subject?.trim()) continue;

      let best: { jobId: string; job: UnifiedJob; score: number; reason: string } | null = null;

      const taggedId = extractJobIdFromMyAssistTag(`${signal.subject}\n${signal.snippet}`);
      if (taggedId) {
        const job = state.jobIndex[taggedId];
        const lc = state.lifecycle[taggedId];
        const saved = state.saved[taggedId];
        if (job && lc && saved) {
          best = { jobId: taggedId, job, score: 100, reason: "subject_job_id" };
        }
      }

      if (!best) {
      for (const jobId of Object.keys(state.saved)) {
        const job = state.jobIndex[jobId];
        const lc = state.lifecycle[jobId];
        if (!job || !lc) continue;
        const hit = matchEmailToJob(signal, job);
        if (!hit) continue;
        if (!best || hit.score > best.score) {
          best = { jobId, job, score: hit.score, reason: hit.reason };
          continue;
        }
        if (best && hit.score === best.score) {
          const signalThreadId = signal.threadId ?? signal.normalizedIdentity?.threadId ?? "";
          const threadExactFor = (candidateJobId: string): boolean => {
            if (!signalThreadId) return false;
            const existingTouchpoints = state.touchpoints[candidateJobId] ?? [];
            return existingTouchpoints.some(
              (tp) => tp.signal_meta?.threadId && tp.signal_meta.threadId === signalThreadId,
            );
          };
          const better = compareMatchTieBreak(
            {
              threadIdExact: threadExactFor(jobId),
              roleOverlap: roleTokenOverlapForJob(signal, job),
              subjectOverlap: subjectTokenOverlapForJob(signal, job),
              jobId,
            },
            {
              threadIdExact: threadExactFor(best.jobId),
              roleOverlap: roleTokenOverlapForJob(signal, best.job),
              subjectOverlap: subjectTokenOverlapForJob(signal, best.job),
              jobId: best.jobId,
            },
          );
          if (better > 0) {
            best = { jobId, job, score: hit.score, reason: hit.reason };
          }
        }
      }
      }
      if (!best) continue;

      const { jobId, job, score, reason } = best;
      const ref = `${signalFingerprint(signal)}|${jobId}`;
      const tps = state.touchpoints[jobId] ?? [];
      const dup = tps.some((tp) => tp.signal_ref === ref);
      let touchpoint_logged = false;
      if (!dup) {
        const at = new Date().toISOString();
        const tp: TouchpointRecord = {
          at,
          channel: "email",
          direction: "incoming",
          subject: signal.subject,
          body_summary: signal.snippet.length > 500 ? `${signal.snippet.slice(0, 497)}...` : signal.snippet,
          signal_ref: ref,
          signal_meta: {
            company: signal.normalizedIdentity?.company,
            role: signal.normalizedIdentity?.role,
            recruiterName: signal.normalizedIdentity?.recruiterName,
            stageAlias: signal.stageAlias,
            stageHintManager: signal.stageHintManager,
            threadId: signal.threadId ?? signal.normalizedIdentity?.threadId,
            messageId: signal.id ?? signal.normalizedIdentity?.messageId,
          },
        };
        tps.push(tp);
        state.touchpoints[jobId] = tps;
        const lc = state.lifecycle[jobId];
        if (lc) {
          lc.last_touchpoint_at = at;
          lc.timeline_events = [
            ...lc.timeline_events,
            { at, kind: "touchpoint", detail: `Email: ${signal.subject.slice(0, 120)}` },
          ];
        }
        touchpoint_logged = true;
      }

      let stage_updated: LifecycleStage | undefined;
      const inferred = signal.stageHintManager ?? inferStageFromEmailText(signal.subject, signal.snippet);
      const lc = state.lifecycle[jobId];
      if (inferred && lc && shouldAdvanceStage(lc.stage, inferred)) {
        lc.stage = inferred;
        lc.timeline_events = [
          ...lc.timeline_events,
          {
            at: new Date().toISOString(),
            kind: "stage",
            detail: `Inferred ${inferred} from email signal`,
          },
        ];
        stage_updated = inferred;
      }

      matches.push({
        job_id: jobId,
        company: job.company,
        title: job.title,
        match_score: score,
        match_reason: reason,
        signal,
        touchpoint_logged,
        stage_updated,
      });
    }

    await this.persist(state);
    return { processed: signals.length, matches };
  }

  async buildDigest(): Promise<Record<string, unknown>> {
    const state = await this.load();
    const tracks = this.mergedTracks(state);
    const byTrack: Record<string, { saved: number; by_stage: Record<string, number> }> = {};
    for (const t of tracks) {
      byTrack[t.id] = { saved: 0, by_stage: {} };
    }
    for (const sid of Object.keys(state.saved)) {
      const s = state.saved[sid];
      const lc = state.lifecycle[sid];
      if (!s || !lc) continue;
      if (!byTrack[s.track]) byTrack[s.track] = { saved: 0, by_stage: {} };
      byTrack[s.track].saved += 1;
      byTrack[s.track].by_stage[lc.stage] = (byTrack[s.track].by_stage[lc.stage] ?? 0) + 1;
    }
    const followupsDue = (await this.listSavedJobs({ only_followup_due: true })).length;
    return {
      generated_at: new Date().toISOString(),
      followups_due_approx: followupsDue,
      by_track: byTrack,
      tracks: tracks.map((t) => ({ id: t.id, label: t.label, kind: t.kind })),
    };
  }
}

function publicJob(j: UnifiedJob): UnifiedJob {
  const { _fingerprint, _fetched_at, _score, _track_guess, _track_confidence, _raw_source, ...pub } = j;
  return { ...pub, tags: [...pub.tags] };
}

function demoRawJobs(): import("../types/job.js").RawJob[] {
  return [
    {
      title: "Senior ML Engineer — Agent Platform",
      company: "Demo Corp",
      location: "Toronto, ON",
      remote: true,
      type: "contract",
      source: "rss",
      url: "https://example.com/jobs/1",
      posted_date: new Date().toISOString().slice(0, 10),
      salary: null,
      description: "LLM agents, RAG, PyTorch, GenAI product team.",
      tags: ["ml", "llm"],
    },
    {
      title: "SAP S/4HANA FI/CO Consultant (6mo contract)",
      company: "Demo SI",
      location: "Remote — Canada",
      remote: true,
      type: "contract",
      source: "rss",
      url: "https://example.com/jobs/2",
      posted_date: new Date().toISOString().slice(0, 10),
      salary: null,
      description: "SAP S/4 migration, contract, strong finance module.",
      tags: ["sap", "fico"],
    },
  ];
}
