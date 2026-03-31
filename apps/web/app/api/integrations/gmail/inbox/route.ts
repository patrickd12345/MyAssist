import { NextResponse } from "next/server";
import { jsonLegacyApiError } from "@/lib/api/error-contract";
import {
  GMAIL_INBOX_DEFAULT_MAX_RESULTS,
  GMAIL_INBOX_HARD_MAX_RESULTS,
} from "@/lib/integrations/gmailInboxFetch";
import { dedupeNormalizedGmailMessages, normalizeGmailInboxPreview } from "@/lib/integrations/gmailNormalize";
import { integrationService } from "@/lib/integrations/service";
import { getIntegrationToken } from "@/lib/integrations/tokenStore";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * GET — bounded read-only inbox page (list + metadata per message).
 * Query: maxResults (optional, default 10, hard-capped), pageToken, q (Gmail search query, length-limited).
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return jsonLegacyApiError("Unauthorized", 401);
  }

  const url = new URL(req.url);
  const maxRaw = url.searchParams.get("maxResults");
  let maxResults: number | undefined;
  if (maxRaw !== null && maxRaw.trim() !== "") {
    const n = Number.parseInt(maxRaw.trim(), 10);
    if (!Number.isFinite(n)) {
      return NextResponse.json({ ok: false, error: "invalid_maxResults" }, { status: 400 });
    }
    maxResults = n;
  }
  const pageToken = url.searchParams.get("pageToken")?.trim() || undefined;
  const q = url.searchParams.get("q")?.trim() || undefined;

  const result = await integrationService.fetchGmailInboxPageForUser(userId, {
    maxResults,
    pageToken,
    q,
  });
  if (result === null) {
    return NextResponse.json({ ok: false, error: "gmail_not_connected" }, { status: 412 });
  }
  if (!result.ok) {
    const status = result.status >= 400 && result.status < 600 ? result.status : 502;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }

  const stored = await getIntegrationToken(userId, "gmail");
  const normalizedAt = new Date().toISOString();
  const normalized = result.messages.map((p) =>
    normalizeGmailInboxPreview(p, {
      providerAccountId: stored?.provider_account_id ?? null,
      normalizedAt,
    }),
  );
  const messages = dedupeNormalizedGmailMessages(normalized);

  return NextResponse.json({
    ok: true,
    messages,
    nextPageToken: result.nextPageToken,
    queryUsed: result.queryUsed,
    maxResults: result.maxResults,
    limits: {
      defaultMaxResults: GMAIL_INBOX_DEFAULT_MAX_RESULTS,
      hardMaxResults: GMAIL_INBOX_HARD_MAX_RESULTS,
    },
  });
}
