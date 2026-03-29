import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { buildGoogleAuthUrl } from "@/lib/integrations/providers/google";
import { buildTodoistAuthUrl } from "@/lib/integrations/providers/todoist";
import type { IntegrationProvider } from "@/lib/integrations/types";
import { oauthDebugLog } from "@/lib/integrations/oauthDebugLog";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { getSessionUserId } from "@/lib/session";

export const dynamic = "force-dynamic";

function callbackUrl(origin: string, provider: IntegrationProvider): string {
  return `${origin}/api/integrations/${provider}/callback`;
}

/** One redirect URI for both Gmail and Calendar so Google Cloud Console only needs a single authorized URI per environment. */
function googleOAuthRedirectUri(origin: string): string {
  return `${origin}/api/integrations/google/callback`;
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: IntegrationProvider }> },
) {
  const rawRequestOrigin = new URL(req.url).origin;
  const origin = resolvePublicOrigin(req);
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.redirect(`${origin}/sign-in`);
  const { provider } = await params;
  const state = createOAuthState(userId, provider);

  try {
    if (provider === "gmail" || provider === "google_calendar") {
      const redirectUri = googleOAuthRedirectUri(origin);
      // #region agent log
      oauthDebugLog({
        hypothesisId: "H1-H3",
        location: "connect/route.ts:google",
        message: "OAuth connect (Google) redirect_uri",
        data: {
          provider,
          requestUrl: req.url,
          rawRequestOrigin,
          resolvedOrigin: origin,
          redirectUri,
          forwardedHost: req.headers.get("x-forwarded-host") ?? null,
          forwardedProto: req.headers.get("x-forwarded-proto") ?? null,
          hasAuthUrlEnv: Boolean(resolveMyAssistRuntimeEnv().authUrl),
          hasNextAuthUrlEnv: Boolean(resolveMyAssistRuntimeEnv().nextAuthUrl),
          hasPublicAppUrlEnv: Boolean(resolveMyAssistRuntimeEnv().publicAppUrl),
          nodeEnv: resolveMyAssistRuntimeEnv().nodeEnv,
        },
      });
      // #endregion
      const authUrl = buildGoogleAuthUrl({
        provider,
        state,
        redirectUri,
      });
      return NextResponse.redirect(authUrl);
    }
    if (provider === "todoist") {
      const authUrl = buildTodoistAuthUrl({
        state,
        redirectUri: callbackUrl(origin, provider),
      });
      return NextResponse.redirect(authUrl);
    }
    return NextResponse.redirect(
      `${origin}/?integrations=error&provider=${provider}&reason=unsupported-provider`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    const reason = message.includes("not configured") ? "provider-not-configured" : "oauth-init-failed";
    return NextResponse.redirect(`${origin}/?integrations=error&provider=${provider}&reason=${reason}`);
  }
}
