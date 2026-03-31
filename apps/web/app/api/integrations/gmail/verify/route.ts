import { NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import { integrationService } from "@/lib/integrations/service";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET — minimal Gmail API verification after OAuth (lists up to 3 message ids).
 * Requires session. Does not implement ingestion; confirms gmail.readonly (and tokens) work.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const result = await integrationService.verifyGmailConnection(userId);
  if (!result.ok) {
    if (result.reason === "disconnected") {
      return NextResponse.json({ ok: false, error: "gmail_not_connected" }, { status: 412 });
    }
    if (result.reason === "insufficient_scope") {
      return NextResponse.json(
        { ok: false, error: "insufficient_scope", detail: "Token cannot list messages (check Gmail OAuth scopes)." },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false, error: result.reason }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    messageIds: result.messageIds,
    profile: result.profile,
    scopes: result.scopes,
  });
}
