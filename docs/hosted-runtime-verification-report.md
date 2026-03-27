# Hosted runtime verification — MyAssist (post–schema migration)

**Date:** 2026-03-27  
**Scope:** Code paths + optional live Supabase smoke (no new migrations).

## 1. Deploy / code paths

| Check | Result |
|--------|--------|
| `MYASSIST_SCHEMA === "myassist"` | **Verified** in [`apps/web/lib/myassistSchema.ts`](../apps/web/lib/myassistSchema.ts) |
| `userStoreSupabase` uses `supabase.schema(MYASSIST_SCHEMA).from(MYASSIST_APP_USERS_TABLE)` | **Verified** (all query sites) |
| `tokenStoreSupabase` uses `supabase.schema(MYASSIST_SCHEMA).from(MYASSIST_INTEGRATION_TOKENS_TABLE)` | **Verified** (all query sites) |
| Contract test (mocked client) | **Pass** — [`apps/web/lib/hostedSupabaseSchema.test.ts`](../apps/web/lib/hostedSupabaseSchema.test.ts) |

**Production deploy URL / Vercel promotion:** not verified from this repo (no deployment API access). Confirm the live deployment is the commit that includes the `myassist` schema-qualified stores.

## 2. Hosted smoke (real Supabase)

| Check | Result |
|--------|--------|
| Live smoke against Bookiji Production from this workspace | **Skipped** — `apps/web/.env.local` has **no** `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` lines (so hosted mode is not configured locally). |
| Automated test added | [`apps/web/lib/hostedRuntimeSmoke.test.ts`](../apps/web/lib/hostedRuntimeSmoke.test.ts) — runs only when `RUN_MYASSIST_HOSTED_SMOKE=1` **and** both Supabase env vars are set. |

**Project URL:** `getSupabaseAdmin` accepts `SUPABASE_URL`, or (same value) `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` from other Bookiji apps.

**Server secret:** use **`SUPABASE_SECRET_KEY`** with the new **Secret key** (`sb_secret_...`, Dashboard → Settings → API) when legacy JWT keys are disabled. **`SUPABASE_SERVICE_ROLE_KEY`** is still read as a fallback (legacy `service_role` JWT). Anon / publishable keys are not used for `myassist` writes. Requires `@supabase/supabase-js` new enough to send non-JWT secrets (see repo `package.json`).

**Run locally when secrets are available** (Node 20+ for `--env-file`):

```bash
cd apps/web
npm run test:hosted-smoke
```

Or:

```bash
cd apps/web
RUN_MYASSIST_HOSTED_SMOKE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run lib/hostedRuntimeSmoke.test.ts
```

The test performs: `createUser` → `findUserByEmail` → `upsertIntegrationToken` (todoist) → `getIntegrationToken` → `listIntegrationStatuses`.

## 3. If hosted calls fail

1. Project URL (`SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_URL`) and server secret **`SUPABASE_SECRET_KEY`** (`sb_secret_...`) or legacy **`SUPABASE_SERVICE_ROLE_KEY`** on the **server** runtime (Vercel or `.env.local`).
2. **Exposed schemas:** Supabase Dashboard → **Settings → API** → **Exposed schemas** must include **`myassist`** (PostgREST must see `myassist` for `supabase.schema("myassist")`).
3. Re-read the error string from logs (often `PGRST106` / schema not exposed, or 401 if key wrong).

## 4. Go / no-go

| Gate | Status |
|------|--------|
| Code uses `myassist` schema for hosted stores | **GO** |
| DB migration + structure (prior session) | **GO** (per [bookiji-shared-supabase-apply-report.md](./bookiji-shared-supabase-apply-report.md)) |
| Live hosted smoke from this machine | **NO-GO / pending** — no Supabase secrets in local env; run `npm run test:hosted-smoke` after adding them, or smoke the **deployed** app (register + connect integration). |
| Deployed revision matches schema-qualified code | **Pending** (team confirmation) |

**Overall:** **Conditional go** — safe to treat hosted storage as ready once you pass either `test:hosted-smoke` with production-linked env or an equivalent manual check on the deployed URL.
