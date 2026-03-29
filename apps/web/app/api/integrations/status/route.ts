import { NextResponse } from 'next/server';
import { jsonLegacyApiError } from '@/lib/api/error-contract';
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return jsonLegacyApiError("Unauthorized", 401);
  const providers = await integrationService.getStatuses(userId);
  return NextResponse.json({ providers });
}
