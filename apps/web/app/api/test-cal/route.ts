import "server-only";
import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  try {
    const events = await integrationService.fetchCalendarEvents(userId);
    return NextResponse.json({ events, count: events?.length });
  } catch (e) {
    return jsonLegacyApiError(String(e instanceof Error ? e.message : String(e) ), 500);
  }
}
