import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const DEFAULT_DIGEST_URL = "http://127.0.0.1:3847/digest";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const digestUrl = process.env.JOB_HUNT_DIGEST_URL?.trim() || DEFAULT_DIGEST_URL;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(digestUrl, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    clearTimeout(timer);

    if (!res.ok) {
      return NextResponse.json({
        ok: false as const,
        digestUrl,
        error: `Digest server returned HTTP ${res.status}`,
      });
    }

    const digest = (await res.json()) as Record<string, unknown>;
    return NextResponse.json({ ok: true as const, digestUrl, digest });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      ok: false as const,
      digestUrl,
      error: message,
    });
  }
}
