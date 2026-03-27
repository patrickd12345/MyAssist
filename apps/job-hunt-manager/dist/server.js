import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { HuntService } from "./services/hunt-service.js";
import { defaultDataPath } from "./store/file-store.js";
const newTrackSchema = z
    .object({
    label: z.string().min(1),
    id: z
        .string()
        .regex(/^[a-z0-9_]+$/)
        .optional(),
    default_keywords: z.array(z.string()).optional(),
    job_type_hint: z.enum(["permanent", "contract", "either"]).optional(),
    notes: z.string().optional(),
})
    .strict();
const filtersSchema = z
    .object({
    ai: z.boolean().optional(),
    sap_bridge: z.boolean().optional(),
    senior_only: z.boolean().optional(),
})
    .optional();
function jsonResult(data) {
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}
function errResult(message) {
    return {
        isError: true,
        content: [{ type: "text", text: message }],
    };
}
async function main() {
    const dataPath = process.env.JOB_HUNT_DATA_PATH ?? defaultDataPath();
    const svc = new HuntService(dataPath);
    const server = new McpServer({ name: "job-hunt-manager", version: "0.1.0" }, {
        instructions: "Job Hunt aggregator for MyAssist: search_jobs (needs track id), save_job with track or new_track, lifecycle tools. Configure JOB_HUNT_*_RSS_URLS for feeds. Optional JOB_HUNT_DEMO_JOBS=true when no RSS. Data file: " +
            dataPath,
    });
    server.registerTool("search_jobs", {
        description: "Search and aggregate jobs (RSS/API-light connectors). Requires a known track id (list_tracks). Results are deduped, ranked, and cached for get_job/save_job.",
        inputSchema: {
            track: z.string().min(1),
            keywords: z.string().optional(),
            location: z.string().optional(),
            remote: z.boolean().optional(),
            job_type: z.enum(["permanent", "contract", "either"]).optional(),
            seniority: z.string().optional(),
            filters: filtersSchema,
            limit: z.number().int().min(1).max(100).optional(),
        },
    }, async (args) => {
        try {
            const r = await svc.searchJobs({
                track: args.track,
                keywords: args.keywords,
                location: args.location,
                remote: args.remote,
                job_type: args.job_type,
                seniority: args.seniority,
                filters: args.filters,
                limit: args.limit,
            });
            return jsonResult(r);
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("get_job", {
        description: "Get cached job by id plus lifecycle, transcripts, touchpoints if any.",
        inputSchema: { id: z.string().min(1) },
    }, async (args) => {
        try {
            return jsonResult(svc.getJob(args.id));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("save_job", {
        description: "Save a lead to storage. Requires job id from search_jobs cache. Pass track id or new_track inline.",
        inputSchema: {
            id: z.string().min(1),
            track: z.string().optional(),
            new_track: newTrackSchema.optional(),
            notes: z.string().optional(),
            bucket: z.string().optional(),
            bridge_pitch: z.string().optional(),
        },
    }, async (args) => {
        try {
            if (!args.track && !args.new_track) {
                return errResult("Provide track or new_track.");
            }
            return jsonResult(svc.saveJob(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("list_tracks", {
        description: "List built-in and user-defined tracks.",
        inputSchema: { include_archived: z.boolean().optional() },
    }, async (args) => {
        try {
            return jsonResult({ tracks: svc.listTracks(args.include_archived ?? false) });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("create_track", {
        description: "Create a user track (registry). Prefer new_track on save_job for one-shot flows.",
        inputSchema: newTrackSchema,
    }, async (args) => {
        try {
            return jsonResult({ track: svc.createTrack(args) });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("archive_track", {
        description: "Soft-archive a user track (hidden from default list_tracks).",
        inputSchema: { track_id: z.string().min(1) },
    }, async (args) => {
        try {
            svc.archiveTrack(args.track_id);
            return jsonResult({ ok: true, track_id: args.track_id });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("mark_applied", {
        description: "Mark a saved job applied (sets follow-up anchors +3d/+7d/+14d).",
        inputSchema: {
            id: z.string().min(1),
            applied_date: z.string().min(1),
            channel: z.string().optional(),
            notes: z.string().optional(),
        },
    }, async (args) => {
        try {
            return jsonResult(svc.markApplied(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("list_saved_jobs", {
        description: "List saved leads with optional filters. only_followup_due uses +3d heuristic after applied.",
        inputSchema: {
            track: z.string().optional(),
            status: z
                .enum([
                "lead",
                "applied",
                "waiting_call",
                "interview_scheduled",
                "interviewed",
                "offer",
                "closed_lost",
                "closed_won",
            ])
                .optional(),
            source: z.enum(["linkedin", "indeed", "workopolis", "company", "loopcv", "rss", "unknown"]).optional(),
            type: z.enum(["permanent", "contract", "unknown"]).optional(),
            only_followup_due: z.boolean().optional(),
        },
    }, async (args) => {
        try {
            return jsonResult({ items: svc.listSavedJobs(args) });
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("update_job_progress", {
        description: "Update lifecycle stage and optional next action; can change track or new_track.",
        inputSchema: {
            id: z.string().min(1),
            stage: z.enum([
                "lead",
                "applied",
                "waiting_call",
                "interview_scheduled",
                "interviewed",
                "offer",
                "closed_lost",
                "closed_won",
            ]),
            next_action: z.string().optional(),
            next_action_date: z.string().optional(),
            notes: z.string().optional(),
            track: z.string().optional(),
            new_track: newTrackSchema.optional(),
        },
    }, async (args) => {
        try {
            return jsonResult(svc.updateJobProgress(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("add_interview_transcript", {
        description: "Attach interview transcript text/ref and extract simple signal bullets.",
        inputSchema: {
            id: z.string().min(1),
            transcript_text: z.string().optional(),
            transcript_ref: z.string().optional(),
            interview_round: z.string().optional(),
            summary: z.string().optional(),
        },
    }, async (args) => {
        try {
            if (!args.transcript_text && !args.transcript_ref) {
                return errResult("Provide transcript_text or transcript_ref.");
            }
            return jsonResult(svc.addInterviewTranscript(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("log_touchpoint", {
        description: "Log email/call/LinkedIn touchpoint; updates last_touchpoint_at.",
        inputSchema: {
            id: z.string().min(1),
            channel: z.enum(["email", "call", "linkedin", "other"]),
            direction: z.enum(["incoming", "outgoing"]),
            subject: z.string().min(1),
            body_summary: z.string().optional(),
        },
    }, async (args) => {
        try {
            return jsonResult(svc.logTouchpoint(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    server.registerTool("score_signing_probability", {
        description: "Deterministic signing probability 0-100 from stage and touchpoints.",
        inputSchema: {
            id: z.string().min(1),
            override_signals: z.object({ delta: z.number().optional() }).optional(),
        },
    }, async (args) => {
        try {
            return jsonResult(svc.scoreSigningProbability(args));
        }
        catch (e) {
            return errResult(e instanceof Error ? e.message : String(e));
        }
    });
    const transport = new StdioServerTransport();
    await server.connect(transport);
}
main().catch((e) => {
    console.error(e);
    process.exit(1);
});
