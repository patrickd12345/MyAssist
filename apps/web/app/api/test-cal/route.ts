import "server-only";
import { NextResponse } from "next/server";
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") || await getSessionUserId();
  
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  try {
    const events = await integrationService.fetchCalendarEvents(userId);
    return NextResponse.json({ events, count: events?.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
