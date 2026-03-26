import { NextResponse } from "next/server";
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const providers = await integrationService.getStatuses(userId);
  return NextResponse.json({ providers });
}
