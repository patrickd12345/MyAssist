import { NextResponse } from "next/server";
import { fetchResolveJobFromStore } from "@/lib/jobHuntResolve";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const incoming = new URL(req.url);
  const q = incoming.searchParams.get("q")?.trim() ?? "";
  const fetchParam = incoming.searchParams.get("fetch")?.trim();
  const trackParam = incoming.searchParams.get("track")?.trim();
  const fetchOnline = fetchParam === "1" || fetchParam === "true";

  try {
    const data = await fetchResolveJobFromStore(q, {
      fetchOnline,
      track: trackParam,
    });
    return NextResponse.json(data);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Unknown track")) {
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
