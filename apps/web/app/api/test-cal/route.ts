import "server-only";
import { NextResponse } from "next/server";
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const events = await integrationService.fetchCalendarEvents(userId);
    return NextResponse.json({ events, count: events?.length });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
