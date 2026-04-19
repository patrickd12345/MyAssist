import { createHash } from "node:crypto";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import type { Provider } from "next-auth/providers";
import { compare } from "bcryptjs";
import { findUserByEmail } from "./userStore";
import { MYASSIST_DEV_AUTH_SECRET_FALLBACK, resolveMyAssistRuntimeEnv } from "./env/runtime";
import { logServerEvent } from "./serverLog";

/**
 * Auth.js reads `process.env.AUTH_SECRET`. We only synthesize it for dev/test and for the
 * Next.js production *build* phase (page data collection). Do not precompute a `secret`
 * string at module load — that can be bundled as a constant and ignore Vercel runtime env.
 *
 * Production runtime: set `AUTH_SECRET` (or `NEXTAUTH_SECRET`) in the Vercel project
 * (Production + Preview as needed). Local team dev: load secrets from Infisical (`pnpm dev:infisical`
 * from `apps/web` or repo root). See `apps/web/README.md` and `apps/web/.env.example`.
 */
function patchAuthSecretForNonProductionContexts(): void {
  const runtime = resolveMyAssistRuntimeEnv(process.env);
  if (runtime.authSecret) {
    return;
  }
  if (runtime.nodeEnv === "development") {
    logServerEvent("warn", "myassist_auth_secret_fallback", {
      message:
        "AUTH_SECRET is unset; using a local fallback. Prefer Infisical (`pnpm dev:infisical`) or set AUTH_SECRET in apps/web/.env.local for stable sessions.",
    });
    process.env.AUTH_SECRET = MYASSIST_DEV_AUTH_SECRET_FALLBACK;
    return;
  }
  if (runtime.nodeEnv === "test") {
    process.env.AUTH_SECRET = MYASSIST_DEV_AUTH_SECRET_FALLBACK;
    return;
  }
  if (runtime.nextPhase === PHASE_PRODUCTION_BUILD) {
    process.env.AUTH_SECRET = MYASSIST_DEV_AUTH_SECRET_FALLBACK;
  }
}

patchAuthSecretForNonProductionContexts();

/**
 * Bind the session cookie name to the current signing secret so stale JWTs from a prior secret
 * are not decrypted (avoids JWTSessionError / "no matching decryption secret"; users appear
 * signed out until they sign in again).
 */
function sessionTokenCookieName(): string {
  const raw = process.env["AUTH_SECRET"] ?? process.env["NEXTAUTH_SECRET"] ?? "";
  const suffix = createHash("sha256").update(raw).digest("hex").slice(0, 16);
  return `authjs.session-token.${suffix}`;
}

const useSecureCookies = process.env.NODE_ENV === "production";
const runtime = resolveMyAssistRuntimeEnv(process.env);
const providers: Provider[] = [
  Credentials({
    name: "credentials",
    credentials: {
      email: { label: "Email", type: "email" },
      password: { label: "Password", type: "password" },
    },
    authorize: async (credentials) => {
      const email = typeof credentials?.email === "string" ? credentials.email : "";
      const password = typeof credentials?.password === "string" ? credentials.password : "";
      if (!email.trim() || !password) return null;

      const user = await findUserByEmail(email);
      if (!user) return null;

      const valid = await compare(password, user.passwordHash);
      if (!valid) return null;

      return {
        id: user.id,
        email: user.email,
      };
    },
  }),
];

if (runtime.googleClientId && runtime.googleClientSecret) {
  providers.push(
    Google({
      clientId: runtime.googleClientId,
      clientSecret: runtime.googleClientSecret,
    }),
  );
}

if (runtime.microsoftClientId && runtime.microsoftClientSecret) {
  providers.push(
    MicrosoftEntraID({
      clientId: runtime.microsoftClientId,
      clientSecret: runtime.microsoftClientSecret,
      issuer: runtime.microsoftTenantId
        ? `https://login.microsoftonline.com/${runtime.microsoftTenantId}/v2.0`
        : undefined,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Bracket access + live env: avoid a one-shot string that ignores Vercel runtime injection.
  secret: process.env["AUTH_SECRET"] ?? process.env["NEXTAUTH_SECRET"],
  session: { strategy: "jwt" },
  cookies: {
    sessionToken: {
      name: sessionTokenCookieName(),
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  pages: {
    signIn: "/sign-in",
  },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      if (user && typeof user.email === "string" && user.email.trim() !== "") {
        token.email = user.email.trim();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
