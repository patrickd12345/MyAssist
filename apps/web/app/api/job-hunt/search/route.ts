import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Same default as digest route: base URL may include `/digest`; `/jobs` resolves on the host. */
const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const { searchParams } = new URL(req.url);
  const track = searchParams.get("track") || "ai_focus";
  const sort = searchParams.get("sort") === "relevance" ? "relevance" : "feed";

  const digestUrl = resolveMyAssistRuntimeEnv().jobHuntDigestUrl || DEFAULT_DIGEST_URL;
  const jobsBase = new URL("/jobs", digestUrl);
  jobsBase.searchParams.set("track", track);
  jobsBase.searchParams.set("sort", sort);
  const jobsUrl = jobsBase.toString();

  try {
    const res = await fetch(jobsUrl, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return jsonLegacyApiError(`Upstream error: ${res.status} ${text}`, 502);
    }
    const data = await res.json();
    return NextResponse.json({ ok: true, data });
  } catch (e) {
    return jsonLegacyApiError(e instanceof Error ? e.message : String(e), 500);
  }
}
