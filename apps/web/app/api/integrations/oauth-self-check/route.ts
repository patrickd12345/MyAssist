import { NextResponse } from "next/server";
import { googleClientId } from "@/lib/integrations/providers/google";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

const GOOGLE_CALLBACK_PATH = "/api/integrations/google/callback";

/**
 * Signed-in users only. Returns the exact redirect_uri string sent to Google for OAuth
 * (no secrets). Use this to fix `redirect_uri_mismatch`: the value must appear verbatim
 * under Google Cloud Console → OAuth client → Authorized redirect URIs for the **same**
 * client ID as GOOGLE_CLIENT_ID / MYASSIST_GMAIL_CLIENT_ID in this deployment.
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawRequestOrigin = new URL(req.url).origin;
  const resolvedOrigin = resolvePublicOrigin(req);
  const redirectUri = `${resolvedOrigin}${GOOGLE_CALLBACK_PATH}`;
  const cid = googleClientId();
  const clientIdSuffix = cid && cid.length > 8 ? cid.slice(-8) : null;

  return NextResponse.json({
    redirectUri,
    resolvedOrigin,
    rawRequestOrigin,
    forwardedHost: req.headers.get("x-forwarded-host"),
    forwardedProto: req.headers.get("x-forwarded-proto"),
    requestUrl: req.url,
    clientIdSuffix,
    hasGoogleClientId: Boolean(cid),
    hint:
      "Add `redirectUri` exactly (scheme, host, path — no trailing slash) to the Web application OAuth client that matches this deployment's client ID.",
  });
}
