import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/integrations/oauthState";
import { buildGoogleAuthUrl } from "@/lib/integrations/providers/google";
import { buildTodoistAuthUrl } from "@/lib/integrations/providers/todoist";
import type { IntegrationProvider } from "@/lib/integrations/types";
import { resolvePublicOrigin } from "@/lib/integrations/origin";
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
  const origin = resolvePublicOrigin(req);
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.redirect(`${origin}/sign-in`);
  
  const { getUserById } = await import("@/lib/userStore");
  const user = await getUserById(userId);
  if (!user) {
    // The user has a session cookie but no longer exists in the database.
    return NextResponse.redirect(`${origin}/?integrations=error&reason=user_not_found`);
  }

  const { provider } = await params;
  const state = createOAuthState(userId, provider);

  try {
    if (provider === "gmail" || provider === "google_calendar") {
      const redirectUri = googleOAuthRedirectUri(origin);
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
