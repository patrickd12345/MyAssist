import "./load-web-env.js";
import { createServer, type IncomingMessage } from "node:http";
import { buildLinkedInViewUrlFromQuery } from "./connectors/linkedin-job-view.js";
import { HuntService } from "./services/hunt-service.js";
import { defaultDataPath } from "./store/file-store.js";
import {
  lifecycleStageSchema,
  type EmailSignalInput,
  type LifecycleStage,
} from "./types/lifecycle.js";
import { newTrackInputSchema } from "./types/tracks.js";

const port = Number(process.env.JOB_HUNT_DIGEST_PORT ?? "3847");
const dataPath = process.env.JOB_HUNT_DATA_PATH ?? defaultDataPath();
const svc = new HuntService(dataPath);

function parseSignalsBody(body: unknown): EmailSignalInput[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { signals?: unknown }).signals;
  if (!Array.isArray(raw)) return [];
  const out: EmailSignalInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const from = typeof o.from === "string" ? o.from : "";
    const subject = typeof o.subject === "string" ? o.subject : "";
    const snippet = typeof o.snippet === "string" ? o.snippet : "";
    const date = typeof o.date === "string" ? o.date : "";
    if (!from.trim() || !subject.trim()) continue;
    out.push({
      from,
      subject,
      snippet,
      date,
      id: typeof o.id === "string" ? o.id : o.id == null ? null : String(o.id),
      threadId: typeof o.threadId === "string" ? o.threadId : o.threadId == null ? null : String(o.threadId),
    });
  }
  return out;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

createServer((req, res) => {
  void (async () => {
    try {
      if (req.method === "POST" && (req.url === "/signals" || req.url?.startsWith("/signals?"))) {
        const parsed = await readJsonBody(req);
        if (parsed === null) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Invalid JSON body" }));
          return;
        }
        const signals = parseSignalsBody(parsed);
        const result = await svc.processEmailSignals(signals);
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(result, null, 2));
        return;
      }
      if (req.method === "GET" && (req.url === "/digest" || req.url?.startsWith("/digest?"))) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(await svc.buildDigest(), null, 2));
        return;
      }
      if (req.method === "POST" && (req.url === "/save-job" || req.url?.startsWith("/save-job?"))) {
        const parsed = await readJsonBody(req);
        if (parsed === null || typeof parsed !== "object") {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Invalid JSON body" }));
          return;
        }
        const body = parsed as Record<string, unknown>;
        const id = typeof body.id === "string" ? body.id.trim() : "";
        if (!id) {
          res.statusCode = 400;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: false, error: "Missing id" }));
          return;
        }
        const notes = typeof body.notes === "string" ? body.notes : undefined;
        const ntRaw = body.new_track;
        res.setHeader("Content-Type", "application/json");
        try {
          let saved;
          if (ntRaw !== undefined && ntRaw !== null && typeof ntRaw === "object" && !Array.isArray(ntRaw)) {
            const parsedNt = newTrackInputSchema.safeParse(ntRaw);
            if (!parsedNt.success) {
              res.statusCode = 400;
              res.end(
                JSON.stringify({
                  ok: false,
                  error: parsedNt.error.issues.map((i) => i.message).join("; ") || "Invalid new_track",
                }),
              );
              return;
            }
            saved = await svc.saveJob({ id, notes, new_track: parsedNt.data });
          } else {
            const track = typeof body.track === "string" && body.track.trim() ? body.track.trim() : "ai_focus";
            saved = await svc.saveJob({ id, track, notes });
          }
          res.end(JSON.stringify({ ok: true, saved }));
        } catch (err) {
          res.statusCode = 400;
          res.end(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : String(err),
            }),
          );
        }
        return;
      }
      if (req.method === "GET" && (req.url === "/saved-jobs" || req.url?.startsWith("/saved-jobs?"))) {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        const track = url.searchParams.get("track")?.trim() || undefined;
        const st = url.searchParams.get("status")?.trim();
        let status: LifecycleStage | undefined;
        if (st) {
          const p = lifecycleStageSchema.safeParse(st);
          if (p.success) status = p.data;
        }
        res.setHeader("Content-Type", "application/json");
        try {
          const rows = await svc.listSavedJobs({ track, status });
          res.end(JSON.stringify({ ok: true, jobs: rows }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }
      if (req.method === "GET" && (req.url === "/resolve-job" || req.url?.startsWith("/resolve-job?"))) {
        const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
        const q = url.searchParams.get("q")?.trim() ?? "";
        const fetchOnline =
          url.searchParams.get("fetch") === "1" || url.searchParams.get("fetch") === "true";
        const track = url.searchParams.get("track")?.trim() || "ai_focus";
        res.setHeader("Content-Type", "application/json");
        try {
          let candidates = await svc.resolveJobCandidates(q);
          let fetched = false;
          let fetchNotLinkedin = false;
          if (candidates.length === 0 && fetchOnline) {
            if (!buildLinkedInViewUrlFromQuery(q)) {
              fetchNotLinkedin = true;
            } else {
              const ingested = await svc.tryIngestLinkedInJobFromQuery(q, track);
              if (ingested) {
                candidates = [ingested];
                fetched = true;
              }
            }
          }
          res.end(
            JSON.stringify({
              ok: true,
              query: q,
              candidates,
              fetched,
              fetch_not_linkedin: fetchNotLinkedin,
            }),
          );
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const badTrack = msg.includes("Unknown track");
          res.statusCode = badTrack ? 400 : 500;
          res.end(JSON.stringify({ ok: false, error: msg }));
        }
        return;
      }
      if (req.method === "GET" && (req.url === "/jobs" || req.url?.startsWith("/jobs?"))) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const track = url.searchParams.get("track") || "ai_focus";
        const sortParam = url.searchParams.get("sort");
        const sort =
          sortParam === "relevance" || sortParam === "feed" ? sortParam : "feed";
        res.setHeader("Content-Type", "application/json");
        try {
          const result = await svc.searchJobs({ track, limit: 50, sort });
          res.end(JSON.stringify(result, null, 2));
        } catch (err) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
        }
        return;
      }
      if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true, service: "job-hunt-manager-digest", dataPath }));
        return;
      }
      res.statusCode = 404;
      res.end("not found");
    } catch (e) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain");
      res.end(e instanceof Error ? e.message : String(e));
    }
  })();
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `job-hunt digest http://127.0.0.1:${port}/digest POST …/signals POST …/save-job GET …/saved-jobs GET …/resolve-job GET …/jobs (data: ${dataPath})\n`,
  );
});
