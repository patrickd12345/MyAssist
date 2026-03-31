import { PHASE_PRODUCTION_BUILD } from "next/constants";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { findUserByEmail } from "./userStore";
import { resolveMyAssistRuntimeEnv } from "./env/runtime";
import { logServerEvent } from "./serverLog";

const FALLBACK_SECRET =
  "myassist-dev-only-auth-secret-min-32-chars-do-not-use-in-production";

/**
 * Auth.js reads `process.env.AUTH_SECRET`. We only synthesize it for dev/test and for the
 * Next.js production *build* phase (page data collection). Do not precompute a `secret`
 * string at module load — that can be bundled as a constant and ignore Vercel runtime env.
 *
 * Production runtime: set `AUTH_SECRET` (or `NEXTAUTH_SECRET`) in the Vercel project
 * (Production + Preview as needed). See apps/web/.env.example.
 */
function patchAuthSecretForNonProductionContexts(): void {
  const runtime = resolveMyAssistRuntimeEnv(process.env);
  if (runtime.authSecret) {
    return;
  }
  if (runtime.nodeEnv === "development") {
    logServerEvent("warn", "myassist_auth_secret_fallback", {
      message:
        "AUTH_SECRET is unset; using a local fallback. Set AUTH_SECRET in apps/web/.env.local for stable sessions.",
    });
    process.env.AUTH_SECRET = FALLBACK_SECRET;
    return;
  }
  if (runtime.nodeEnv === "test") {
    process.env.AUTH_SECRET = FALLBACK_SECRET;
    return;
  }
  if (runtime.nextPhase === PHASE_PRODUCTION_BUILD) {
    process.env.AUTH_SECRET = FALLBACK_SECRET;
  }
}

patchAuthSecretForNonProductionContexts();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  // Bracket access + live env: avoid a one-shot string that ignores Vercel runtime injection.
  secret: process.env["AUTH_SECRET"] ?? process.env["NEXTAUTH_SECRET"],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/sign-in",
  },
  providers: [
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
  ],
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
