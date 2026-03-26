import { NextResponse } from "next/server";
import { integrationService } from "@/lib/integrations/service";
import type { IntegrationProvider } from "@/lib/integrations/types";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ provider: IntegrationProvider }> },
) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { provider } = await params;
  await integrationService.disconnect(userId, provider);
  return NextResponse.json({ ok: true, provider });
}
