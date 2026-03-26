import { aggregateRawJobs } from "../core/aggregate.js";
import { dedupeJobs } from "../core/dedupe.js";
import { applyDomainFilters, applyQueryFilters } from "../core/filter.js";
import { rawToUnified } from "../core/normalize.js";
import { rankJobs } from "../core/rank.js";
import { annotateTrackGuess } from "../core/track-classifier.js";
import { computeSigningProbability } from "../core/probability.js";
import { extractTranscriptSignals } from "../core/transcript-signals.js";
import { loadState, saveState } from "../store/file-store.js";
import { builtinTracks, newTrackInputSchema, slugifyTrackLabel, } from "../types/tracks.js";
import { lifecycleStageSchema } from "../types/lifecycle.js";
export class HuntService {
    dataPath;
    constructor(dataPath) {
        this.dataPath = dataPath;
    }
    load() {
        return loadState(this.dataPath);
    }
    persist(s) {
        saveState(s, this.dataPath);
    }
    mergedTracks(state, includeArchived = false) {
        const user = state.userTracks.filter((t) => includeArchived || !t.archived);
        const built = builtinTracks();
        return [...built, ...user];
    }
    getTrack(state, trackId) {
        return this.mergedTracks(state, true).find((t) => t.id === trackId);
    }
    createTrack(input) {
        const parsed = newTrackInputSchema.parse(input);
        const state = this.load();
        const id = parsed.id ?? slugifyTrackLabel(parsed.label);
        if (this.getTrack(state, id)) {
            throw new Error(`Track id already exists: ${id}. Use list_tracks or pick another id.`);
        }
        const t = {
            id,
            label: parsed.label,
            kind: "user",
            default_keywords: parsed.default_keywords ?? [],
            job_type_hint: parsed.job_type_hint,
            notes: parsed.notes,
        };
        state.userTracks.push(t);
        this.persist(state);
        return t;
    }
    archiveTrack(trackId) {
        const state = this.load();
        const bt = builtinTracks().some((b) => b.id === trackId);
        if (bt) {
            throw new Error(`Cannot archive built-in track: ${trackId}`);
        }
        const u = state.userTracks.find((x) => x.id === trackId);
        if (!u)
            throw new Error(`Unknown track: ${trackId}`);
        u.archived = true;
        this.persist(state);
    }
    listTracks(includeArchived = false) {
        const state = this.load();
        return this.mergedTracks(state, includeArchived);
    }
    resolveTrackOnSave(state, track, newTrack) {
        if (newTrack) {
            const created = this.createTrack(newTrack);
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
    async searchJobs(args) {
        const state = this.load();
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
        let jobTypeFilter;
        if (args.job_type && args.job_type !== "either") {
            jobTypeFilter = args.job_type;
        }
        else if (tr.job_type_hint && tr.job_type_hint !== "either") {
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
        const ranked = rankJobs(annotated, keywordQuery, tr.default_keywords);
        const lim = Math.min(Math.max(args.limit ?? 25, 1), 100);
        const slice = ranked.slice(0, lim);
        const next = {
            ...state,
            jobIndex: { ...state.jobIndex },
        };
        for (const j of slice) {
            next.jobIndex[j.id] = { ...j };
        }
        this.persist(next);
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
            },
            total_deduped: deduped.length,
            returned: slice.length,
            jobs: slice.map(publicJob),
        };
    }
    getJob(id) {
        const state = this.load();
        const job = state.jobIndex[id] ?? null;
        return {
            job: job ? publicJob(job) : null,
            lifecycle: state.lifecycle[id] ?? null,
            transcripts: state.transcripts[id] ?? [],
            touchpoints: state.touchpoints[id] ?? [],
        };
    }
    saveJob(input) {
        let state = this.load();
        const trackId = this.resolveTrackOnSave(state, input.track, input.new_track);
        state = this.load();
        const job = state.jobIndex[input.id];
        if (!job) {
            throw new Error(`Unknown job id: ${input.id}. Run search_jobs first so the job is cached.`);
        }
        const saved = {
            job_id: input.id,
            track: trackId,
            notes: input.notes,
            bucket: input.bucket,
            bridge_pitch: input.bridge_pitch,
            saved_at: new Date().toISOString(),
        };
        state.saved[input.id] = saved;
        const existing = state.lifecycle[input.id];
        const lifecycle = existing ?? {
            job_id: input.id,
            track: trackId,
            stage: "lead",
            interview_transcript_refs: [],
            timeline_events: [],
        };
        lifecycle.track = trackId;
        if (input.bridge_pitch)
            lifecycle.bridge_pitch = input.bridge_pitch;
        lifecycle.timeline_events = [
            ...lifecycle.timeline_events,
            { at: new Date().toISOString(), kind: "saved", detail: `Saved to track ${trackId}` },
        ];
        state.lifecycle[input.id] = lifecycle;
        this.persist(state);
        return saved;
    }
    markApplied(input) {
        const state = this.load();
        const saved = state.saved[input.id];
        if (!saved) {
            throw new Error(`Save the job before mark_applied: ${input.id}`);
        }
        const lc = state.lifecycle[input.id];
        if (!lc)
            throw new Error(`Missing lifecycle for ${input.id}`);
        const at = Date.parse(input.applied_date);
        if (Number.isNaN(at))
            throw new Error("Invalid applied_date (ISO expected)");
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
        this.persist(state);
        return lc;
    }
    listSavedJobs(input) {
        const state = this.load();
        const out = [];
        const now = Date.now();
        for (const sid of Object.keys(state.saved)) {
            const saved = state.saved[sid];
            if (!saved)
                continue;
            if (input.track && saved.track !== input.track)
                continue;
            const job = state.jobIndex[sid] ?? null;
            const lifecycle = state.lifecycle[sid];
            if (!lifecycle)
                continue;
            if (input.status && lifecycle.stage !== input.status)
                continue;
            if (input.source && job && job.source !== input.source)
                continue;
            if (input.type && job && job.type !== input.type)
                continue;
            if (input.only_followup_due) {
                const due = lifecycle.followups?.d3 ? Date.parse(lifecycle.followups.d3) : null;
                const tps = state.touchpoints[sid] ?? [];
                const lastOut = [...tps].reverse().find((t) => t.direction === "outgoing");
                const stale = lifecycle.stage === "applied" &&
                    due !== null &&
                    now > due &&
                    (!lastOut || Date.parse(lastOut.at) < due);
                if (!stale)
                    continue;
            }
            out.push({ saved, job: job ? publicJob(job) : null, lifecycle });
        }
        return out;
    }
    updateJobProgress(input) {
        let state = this.load();
        const lc = state.lifecycle[input.id];
        if (!lc)
            throw new Error(`No lifecycle for ${input.id}. save_job first.`);
        const stage = lifecycleStageSchema.parse(input.stage);
        let trackId = lc.track;
        if (input.new_track || input.track) {
            trackId = this.resolveTrackOnSave(state, input.track, input.new_track);
            state = this.load();
        }
        lc.stage = stage;
        lc.track = trackId;
        if (input.next_action !== undefined)
            lc.next_action = input.next_action;
        if (input.next_action_date !== undefined)
            lc.next_action_date = input.next_action_date;
        lc.timeline_events.push({
            at: new Date().toISOString(),
            kind: "stage",
            detail: [stage, input.notes].filter(Boolean).join(" | "),
        });
        if (state.saved[input.id]) {
            state.saved[input.id].track = trackId;
        }
        state.lifecycle[input.id] = lc;
        this.persist(state);
        return lc;
    }
    addInterviewTranscript(input) {
        const state = this.load();
        if (!state.lifecycle[input.id])
            throw new Error(`No lifecycle for ${input.id}`);
        const text = input.transcript_text ?? "";
        const signals = text.length > 40 ? extractTranscriptSignals(text) : undefined;
        const rec = {
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
        this.persist(state);
        return rec;
    }
    logTouchpoint(input) {
        const state = this.load();
        if (!state.lifecycle[input.id])
            throw new Error(`No lifecycle for ${input.id}`);
        const tp = {
            at: new Date().toISOString(),
            channel: input.channel,
            direction: input.direction,
            subject: input.subject,
            body_summary: input.body_summary,
        };
        const list = state.touchpoints[input.id] ?? [];
        list.push(tp);
        state.touchpoints[input.id] = list;
        state.lifecycle[input.id].last_touchpoint_at = tp.at;
        this.persist(state);
        return tp;
    }
    scoreSigningProbability(input) {
        const state = this.load();
        const lc = state.lifecycle[input.id];
        if (!lc)
            throw new Error(`No lifecycle for ${input.id}`);
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
        this.persist(state);
        return { score, factors, lifecycle: lc };
    }
    buildDigest() {
        const state = this.load();
        const tracks = this.mergedTracks(state);
        const byTrack = {};
        for (const t of tracks) {
            byTrack[t.id] = { saved: 0, by_stage: {} };
        }
        for (const sid of Object.keys(state.saved)) {
            const s = state.saved[sid];
            const lc = state.lifecycle[sid];
            if (!s || !lc)
                continue;
            if (!byTrack[s.track])
                byTrack[s.track] = { saved: 0, by_stage: {} };
            byTrack[s.track].saved += 1;
            byTrack[s.track].by_stage[lc.stage] = (byTrack[s.track].by_stage[lc.stage] ?? 0) + 1;
        }
        const followupsDue = this.listSavedJobs({ only_followup_due: true }).length;
        return {
            generated_at: new Date().toISOString(),
            followups_due_approx: followupsDue,
            by_track: byTrack,
            tracks: tracks.map((t) => ({ id: t.id, label: t.label, kind: t.kind })),
        };
    }
}
function publicJob(j) {
    const { _fingerprint, _fetched_at, _score, _track_guess, _track_confidence, _raw_source, ...pub } = j;
    return { ...pub, tags: [...pub.tags] };
}
function demoRawJobs() {
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
