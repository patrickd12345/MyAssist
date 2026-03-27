# Hosted deployment readiness (beta / first cohort)

This document replaces vague “pilot” wording with a concrete checklist: **one deployed app** on a public URL, safe for invited testers. See also [architecture.md](./architecture.md) for provider boundaries.

## Hosting path (decision)

**Path A — Vercel (or similar) + Supabase (recommended for multiple testers)**  
When the Supabase project URL and a **server secret** are set in the **server** environment (`SUPABASE_SECRET_KEY` = new `sb_secret_...`, or legacy `SUPABASE_SERVICE_ROLE_KEY` = JWT when still enabled), the app stores:

- Users and password reset fields in Postgres (`myassist.app_users`)
- Encrypted OAuth token rows in Postgres (`myassist.integration_tokens`)

Apply the SQL migrations in order: [20260327140000_myassist_hosted_storage.sql](../supabase/migrations/20260327140000_myassist_hosted_storage.sql) (legacy `public` table creation, if not already applied), then [20260328120000_myassist_schema_refactor.sql](../supabase/migrations/20260328120000_myassist_schema_refactor.sql) (moves into schema `myassist` and renames tables). Use CLI `supabase db push` or Dashboard SQL. The server must use the **service role** key only in backend env vars—never in client bundles.

If those variables are **unset**, the app keeps the previous behavior: local `.myassist-memory` JSON files (fine for local dev or a single long-lived Node host with a persistent disk).

**Path B — Single Node + persistent volume**  
Keep file storage; add backups, TLS, and process supervision. Still use production `AUTH_SECRET`, OAuth redirect URLs, and monitoring below.

## Production configuration checklist

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` or `NEXTAUTH_SECRET` | Required for `next build` / production runtime (Auth.js). |
| `AUTH_URL` | Public origin of the app (e.g. `https://app.example.com`). |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Optional; enables durable users + integrations on Postgres (Path A). Use **Secret key** (`sb_secret_...`) if legacy JWT keys are disabled. |
| `MYASSIST_REGISTRATION_INVITE_CODE` | Optional; invite-only registration for early access. |
| `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY` | **Strongly recommended** in production (32-byte base64 or any string; see [apps/web/.env.example](../apps/web/.env.example)). Stable across deploys so tokens remain decryptable. |
| Google / Todoist OAuth client config | Redirect URIs must match the **deployed** origin (`/api/integrations/{provider}/callback`). |
| `SENTRY_DSN` and/or `NEXT_PUBLIC_SENTRY_DSN` | Optional; error reporting ([Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)). |
| `SENTRY_ENVIRONMENT` | Optional; defaults to `VERCEL_ENV` or `NODE_ENV`. |

**Local `next build`:** set `AUTH_SECRET` (32+ chars) or the build will fail when collecting auth routes.

## Security and auth boundaries

- Most JSON API routes use `getSessionUserId()` and return **401** when there is no session.
- **`/api/test-cal`** is session-only (no `userId` query bypass)—avoid cross-user calendar reads.
- OAuth callbacks validate signed state; tokens are stored per authenticated user id (UUID when using Supabase-backed users).

## Observability

- Server, Edge, and client Sentry entrypoints live under `apps/web/` (`instrumentation.ts`, `sentry.*.config.ts`, `app/global-error.tsx`).
- Optional: Vercel Analytics / Speed Insights for product health.

## Reliability notes (provider calls)

- Gmail / Calendar adapters refresh OAuth access tokens when near expiry (`withGoogleAccessToken` pattern in `gmailAdapter` and similar). Individual REST calls are **not** automatically retried with backoff; transient 5xx/429 behavior depends on the provider. For hosted ops, watch Sentry and Vercel logs; consider adding targeted retries on specific routes if noise is high.

## First cohort (lightweight ops)

- Know who has access (invite code rotation revokes **new** signups, not existing accounts).
- Decide how testers reach you for bugs and what you log (minimal one-page privacy stance).
- For Path A, user disablement is a future enhancement (DB flag or Supabase Auth migration); today you can rotate secrets and invalidate sessions by changing `AUTH_SECRET` (logs everyone out).

## Deployment runbook (short)

1. Create or wake Supabase project; apply migration SQL.
2. Set Vercel (or host) env vars from the checklist; redeploy.
3. Confirm OAuth redirect URIs with Google / Todoist (and Google Cloud “Authorized domains”).
4. Smoke-test: register (with invite if set), sign in, connect one integration, load Today.
5. Confirm Sentry receives a test event (optional).

## Related implementation files

- User facade: [apps/web/lib/userStore.ts](../apps/web/lib/userStore.ts) (file vs Supabase)
- Integrations facade: [apps/web/lib/integrations/tokenStore.ts](../apps/web/lib/integrations/tokenStore.ts)
- Supabase admin client: [apps/web/lib/supabaseAdmin.ts](../apps/web/lib/supabaseAdmin.ts)
