import { PHASE_PRODUCTION_BUILD } from "next/constants";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { findUserByEmail } from "./userStore";

const FALLBACK_SECRET =
  "myassist-dev-only-auth-secret-min-32-chars-do-not-use-in-production";

/**
 * Auth.js merges `process.env.AUTH_SECRET` inside `setEnvDefaults`. If it stays
 * empty while the merged config ends up without a usable `secret`, `assertConfig`
 * throws MissingSecret (500 on `/api/auth/session`). Always normalize env first.
 */
function ensureAuthSecretForAuthJs(): string {
  const authSecret = process.env.AUTH_SECRET?.trim();
  const nextAuthSecret = process.env.NEXTAUTH_SECRET?.trim();
  if (authSecret) {
    return authSecret;
  }
  if (nextAuthSecret) {
    process.env.AUTH_SECRET = nextAuthSecret;
    return nextAuthSecret;
  }
  if (process.env.NODE_ENV === "development") {
    console.warn(
      "[auth] AUTH_SECRET is unset; using a local fallback. Set AUTH_SECRET in apps/web/.env.local for stable sessions.",
    );
    process.env.AUTH_SECRET = FALLBACK_SECRET;
    return FALLBACK_SECRET;
  }
  if (process.env.NODE_ENV === "test") {
    process.env.AUTH_SECRET = FALLBACK_SECRET;
    return FALLBACK_SECRET;
  }
  // `next build` loads route modules with NODE_ENV=production while collecting page data; secrets
  // may be unset locally or not yet applied. Runtime on Vercel still gets AUTH_SECRET from env.
  if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
    process.env.AUTH_SECRET = FALLBACK_SECRET;
    return FALLBACK_SECRET;
  }
  throw new Error(
    "AUTH_SECRET (or NEXTAUTH_SECRET) must be set in production. Generate with: npx auth secret",
  );
}

const resolvedSecret = ensureAuthSecretForAuthJs();

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: resolvedSecret,
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
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
