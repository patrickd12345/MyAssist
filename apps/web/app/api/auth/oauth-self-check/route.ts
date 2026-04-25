import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type OAuthCapabilitySelfCheck = {
  googleEnabled: boolean;
  microsoftEnabled: boolean;
  passwordResetEnabled: boolean;
  authEnabled: boolean;
};

function hasEnv(name: string): boolean {
  return Boolean(process.env[name]?.trim());
}

function disabledCapabilities(): OAuthCapabilitySelfCheck {
  return {
    googleEnabled: false,
    microsoftEnabled: false,
    passwordResetEnabled: false,
    authEnabled: false,
  };
}

function resolveCapabilities(): OAuthCapabilitySelfCheck {
  return {
    googleEnabled: hasEnv("GOOGLE_CLIENT_ID"),
    microsoftEnabled: hasEnv("MICROSOFT_CLIENT_ID") && hasEnv("MICROSOFT_CLIENT_SECRET"),
    passwordResetEnabled: hasEnv("RESEND_API_KEY") && hasEnv("MYASSIST_PASSWORD_RESET_EMAIL_FROM"),
    authEnabled: hasEnv("AUTH_SECRET") && hasEnv("AUTH_URL"),
  };
}

export async function GET() {
  try {
    return NextResponse.json(resolveCapabilities());
  } catch {
    return NextResponse.json(disabledCapabilities());
  }
}
