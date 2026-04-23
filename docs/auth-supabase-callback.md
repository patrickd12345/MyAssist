# Supabase auth callback and `app_users` bridge

## End-to-end flow

1. User completes Supabase sign-in (magic link, password, or OAuth). Supabase redirects the browser to **`/auth/callback?code=…`** (PKCE) with optional **`callbackUrl`** / **`next`** (internal path only).
2. **Route handler** `GET /auth/callback` (`app/auth/callback/route.ts`) delegates to **`runAuthCallbackGet`** in `lib/auth/completeAuthCallback.ts` so cookie reads/writes run in a Route Handler context.
3. **`createServerClient`** (`@supabase/ssr`) exchanges **`code`** for a session and persists cookies.
4. **`getUser()`** loads the Supabase `auth.users` subject.
5. **`ensureAppUser(user)`** (`lib/ensureAppUser.ts`) upserts into **`myassist.app_users`** keyed by the same `id` as `auth.users`, with idempotent handling for email races (`EMAIL_CONFLICT` if another row already owns the email).
6. On success, the handler **redirects** to same-origin **`{origin}{destination}`** with `destination` from `safeInternalPath` (blocks open redirects).

`ensureAppUser` is **only** called from this explicit callback path (and from any other documented server routes you add for the same contract). It is **not** run inside generic “session” helpers, so routine reads do not perform hidden `myassist` writes.

## Error query params (redirect to `/sign-in`)

| `error` value     | When |
|-------------------|------|
| `missing_code`    | No `code` in the callback query string. |
| `auth_unavailable`| Supabase URL or anon key missing in server env. |
| `exchange_failed` | `exchangeCodeForSession` failed. |
| `session_failed`  | `getUser()` failed or returned no user after exchange. |
| `account_link`    | `ensureAppUser` returned `EMAIL_CONFLICT`. |
| `bridge_failed`   | Other `ensureAppUser` failure (`DB_ERROR`, `UNAVAILABLE`, `MISSING_EMAIL`, etc.). |

User-visible copy is centralized in `app/sign-in/SignInForm.tsx` (`AUTH_ERROR_COPY`).

## Browser `redirectTo` and sibling Bookiji apps

Client-side `signInWithOAuth` and magic links use **`buildMyAssistAuthCallbackUrl`** (`lib/authPublicOrigin.ts`).

Current guardrail behavior:
- Prefers **`NEXT_PUBLIC_SITE_URL`** only when it is host-valid for the active origin.
- Rejects cross-origin configured hosts for non-Bookiji origins.
- On shared Bookiji hosts (for example `app.bookiji.com`), enforces MyAssist callback host as **`https://myassist.bookiji.com`**.
- Falls back to a safe origin (`window.location.origin` or canonical MyAssist host) when config is invalid.

Operational requirement remains: set **`NEXT_PUBLIC_SITE_URL=https://myassist.bookiji.com`** on the MyAssist Vercel project (and in Infisical for team dev), and keep Supabase **Site URL** / **Redirect URLs** aligned with MyAssist. **`pnpm run check:env:prod`** flags a missing `NEXT_PUBLIC_SITE_URL` in production-like checks.

## Stale session cookies (`refresh_token_not_found`)

If the dev server logs **`AuthApiError` / `refresh_token_not_found`** on a visit to `/`, the browser had Supabase cookies that no longer match the current project or session (e.g. env change, token revoked, or switching between Bookiji products on the same host). **`getSupabaseServerUser`** clears the session via `signOut()` when it detects that error so the next request does not keep retrying. In **development**, React Strict Mode can still surface **two** such messages on the first load (double mount). The `feature_collector.js` “deprecated parameters” message in the browser console is usually a **browser extension**, not this app.

## Operations

- **Local / Preview:** set `AUTH_URL` (or rely on forwarded host) and Supabase keys as in `apps/web/.env.example` and Infisical.
- **E2E boot “looks stuck”:** see **Playwright E2E** in `apps/web/README.md` (Playwright starts `next dev` on **127.0.0.1:3005** and waits for readiness before tests run).

## Related code

- `lib/auth/completeAuthCallback.ts` — exchange, session, `ensureAppUser`, redirect
- `lib/ensureAppUser.ts` — `myassist.app_users` upsert
- `lib/safeInternalPath.ts` — post-auth path allowlist
- `lib/myassistSiteOrigin.ts` / `lib/integrations/origin.ts` — public origin for redirects and OAuth
