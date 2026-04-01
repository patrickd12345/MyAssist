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

## AI inference (hosted vs local)

Serverless hosts (for example Vercel) **cannot** reach `http://127.0.0.1:11434` on a developer machine. The app defaults `AI_MODE` to **ollama** and `OLLAMA_BASE_URL` to **127.0.0.1** in [`apps/web/lib/env/runtime.ts`](../apps/web/lib/env/runtime.ts), so a **hosted** deploy will usually hit connection errors and use **deterministic fallback** for assistant responses unless you configure one of the paths below.

**Recommended for production hosted assistant (no self-hosted Ollama):**

- Set `AI_MODE=gateway`.
- Set `VERCEL_AI_BASE_URL` (or `AI_GATEWAY_BASE_URL`) to the OpenAI-compatible base URL **without** a trailing `/v1` (the runtime appends `/v1/chat/completions`).
- Set `VERCEL_VIRTUAL_KEY` or `AI_GATEWAY_API_KEY` or `OPENAI_API_KEY` (see [`packages/ai-runtime/src/index.ts`](../packages/ai-runtime/src/index.ts)).
- Set `OPENAI_MODEL` or `AI_GATEWAY_MODEL` if you override the default model (`gpt-4o-mini`).

**Alternative — remote Ollama:** leave `AI_MODE` unset (or ollama) and set `OLLAMA_BASE_URL` to a URL reachable from the server (public HTTPS, VPN, or tunnel). Same machine as `next dev` should use `http://127.0.0.1:11434` only when the Node process can reach that host.

**Explicit non-LLM assistant:** set `AI_MODE=fallback` so behavior is clearly deterministic rather than failing over silently.

Chat, headline, and situation-brief paths use [`apps/web/lib/aiRuntime.ts`](../apps/web/lib/aiRuntime.ts) (`executeChat`); headline and situation brief candidate models switch to the gateway model when `AI_MODE=gateway`.

## Today view refresh (MVP scope)

Primary UX is **refresh after OAuth return** and **after user actions** (task complete, provider slice refresh), not background polling. The dashboard strips `?integrations=connected` and refetches daily context on success (see [`apps/web/components/Dashboard.tsx`](../apps/web/components/Dashboard.tsx)). **Background polling is out of scope** for this MVP unless product requirements change.

## Production configuration checklist

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` or `NEXTAUTH_SECRET` | Required for `next build` / production runtime (Auth.js). |
| `AUTH_URL` | Public origin of the app (e.g. `https://app.example.com`). |
| `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) + `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` | Optional; enables durable users + integrations on Postgres (Path A). Use **Secret key** (`sb_secret_...`) if legacy JWT keys are disabled. |
| `MYASSIST_REGISTRATION_INVITE_CODE` | Optional; invite-only registration for early access. |
| `MYASSIST_INTEGRATIONS_ENCRYPTION_KEY` | **Strongly recommended** in production (32-byte base64 or any string; see [apps/web/.env.example](../apps/web/.env.example)). Stable across deploys so tokens remain decryptable. |
| Google / Todoist OAuth client config | Redirect URIs must match the **deployed** origin. **Google (Gmail + Calendar)** uses a single URI: `{origin}/api/integrations/google/callback`. **Todoist** uses `{origin}/api/integrations/todoist/callback`. |
| `AI_MODE`, `VERCEL_AI_BASE_URL`, gateway keys, `OLLAMA_*` | See **AI inference (hosted vs local)** above; required for non-fallback assistant on the deployed host. |
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

1. Create or wake Supabase project; apply migration SQL (`supabase db push` from repo root, or equivalent).
2. Set Vercel (or host) env vars from the checklist (including **AI inference** vars for hosted assistant); redeploy.
3. Confirm OAuth redirect URIs with Google / Todoist (and Google Cloud “Authorized domains”).
4. Smoke-test: register (with invite if set), sign in, connect one integration, load Today.
5. Confirm **`x-myassist-context-source`** on `GET /api/daily-context` is **`live`** when not using mock/demo (browser Network tab or `curl -I` with session cookie).
6. Open the Assistant tab, send a chat message, and confirm the JSON response **`mode`** is **`gateway`** or **`ollama`** (not only **`fallback`**) when AI env is configured; if **`fallback`**, check Vercel logs and AI env vars.
7. Confirm Sentry receives a test event (optional).

## Related implementation files

- User facade: [apps/web/lib/userStore.ts](../apps/web/lib/userStore.ts) (file vs Supabase)
- Integrations facade: [apps/web/lib/integrations/tokenStore.ts](../apps/web/lib/integrations/tokenStore.ts)
- Supabase admin client: [apps/web/lib/supabaseAdmin.ts](../apps/web/lib/supabaseAdmin.ts)
