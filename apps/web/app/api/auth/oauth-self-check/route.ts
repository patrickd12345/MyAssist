import { NextResponse } from "next/server";
import { resolveMyAssistRuntimeEnv } from "@/lib/env/runtime";
import { resolvePublicOrigin } from "@/lib/integrations/origin";

export const dynamic = "force-dynamic";

const AUTH_GOOGLE_CALLBACK_PATH = "/api/auth/callback/google";
const AUTH_MICROSOFT_CALLBACK_PATH = "/api/auth/callback/microsoft-entra-id";
const GOOGLE_INTEGRATION_CALLBACK_PATH = "/api/integrations/google/callback";

function hasBoth(id: string, secret: string): boolean {
  return Boolean(id && secret);
}

/**
 * BKI-019: non-secret production OAuth diagnostic for login/provider console setup.
 *
 * This intentionally returns callback URLs and boolean readiness only. It never returns
 * OAuth client ids, client secrets, Auth.js secrets, reset tokens, or Resend keys.
 */
export async function GET(req: Request) {
  const origin = resolvePublicOrigin(req);
  const runtime = resolveMyAssistRuntimeEnv();

  const googleAuthCallbackUrl = `${origin}${AUTH_GOOGLE_CALLBACK_PATH}`;
  const microsoftAuthCallbackUrl = `${origin}${AUTH_MICROSOFT_CALLBACK_PATH}`;
  const googleIntegrationCallbackUrl = `${origin}${GOOGLE_INTEGRATION_CALLBACK_PATH}`;

  return NextResponse.json({
    ok: true,
    origin,
    providerStatus: {
      authSecretConfigured: Boolean(runtime.authSecret),
      authUrlConfigured: Boolean(runtime.authUrl || runtime.nextAuthUrl || runtime.publicAppUrl),
      googleLoginConfigured: hasBoth(runtime.googleClientId, runtime.googleClientSecret),
      microsoftLoginConfigured: hasBoth(runtime.microsoftClientId, runtime.microsoftClientSecret),
      passwordResetEmailConfigured: hasBoth(runtime.resendApiKey, runtime.passwordResetEmailFrom),
    },
    authJsCallbacks: {
      google: googleAuthCallbackUrl,
      microsoftEntraId: microsoftAuthCallbackUrl,
    },
    integrationCallbacks: {
      google: googleIntegrationCallbackUrl,
    },
    googleCloudConsole: {
      authorizedJavaScriptOrigin: origin,
      authorizedRedirectUris: [googleAuthCallbackUrl, googleIntegrationCallbackUrl],
    },
    microsoftEntraId: {
      redirectUri: microsoftAuthCallbackUrl,
    },
    notes: [
      "Google login and Gmail/Calendar integration are separate callback URLs.",
      "Add both Google redirect URIs to the same OAuth 2.0 Web client that matches this deployment's GOOGLE_CLIENT_ID unless intentionally using separate clients.",
      "This endpoint does not expose secret values.",
    ],
  });
}
