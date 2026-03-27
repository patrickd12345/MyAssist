import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Same default as digest route: base URL may include `/digest`; `/jobs` resolves on the host. */
const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track") || "ai_focus";
  const sort = searchParams.get("sort") === "relevance" ? "relevance" : "feed";

  const digestUrl = process.env.JOB_HUNT_DIGEST_URL?.trim() || DEFAULT_DIGEST_URL;
  const jobsBase = new URL("/jobs", digestUrl);
  jobsBase.searchParams.set("track", track);
  jobsBase.searchParams.set("sort", sort);
  const jobsUrl = jobsBase.toString();

  try {
    const res = await fetch(jobsUrl, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ ok: false, error: `Upstream error: ${res.status} ${text}` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
