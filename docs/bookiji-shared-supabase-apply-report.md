# Bookiji shared Supabase — MyAssist migration apply report

**Target project:** Bookiji – Production (`uradoazoyhhozbemrccj`)

## 1. Migrations applied

| Repo file | Applied on shared DB | Notes |
|-----------|----------------------|--------|
| `20260327140000_myassist_hosted_storage.sql` | **Skipped** | No `public.myassist_*` tables existed (greenfield). |
| `20260328120000_myassist_schema_refactor.sql` | **Yes** | Applied via Supabase MCP `apply_migration` as `myassist_schema_refactor`. Remote migration version recorded: **`20260327183458`** (name: `myassist_schema_refactor`). SQL matches the repo file. |

**Earlier session (project INACTIVE):** automation could not connect; no changes were applied then.

## 2. Post-apply verification (executed)

| Check | Result |
|--------|--------|
| `pg_tables` in `myassist` | `app_users`, `integration_tokens` |
| Legacy `public.myassist_*` | **No rows** |
| `rowsecurity` on both tables | **true** |
| Indexes on `integration_tokens` | `integration_tokens_pkey`, `integration_tokens_user_id_idx` |
| `platform.entitlements` CHECK | `platform_entitlements_product_key_check` includes **`myassist`** (`bookiji`, `kinetix`, `chess`, `myassist`) |

Re-run anytime:

```sql
select schemaname, tablename from pg_tables where schemaname = 'myassist' order by tablename;
select schemaname, tablename from pg_tables
where schemaname = 'public' and tablename in ('myassist_app_users','myassist_integration_tokens');
select schemaname, tablename, rowsecurity from pg_tables where schemaname = 'myassist';
select indexname from pg_indexes where schemaname = 'myassist' and tablename = 'integration_tokens';
```

## 3. Deploy updated app

Deploy the build that uses `MYASSIST_SCHEMA` and `supabase.schema("myassist")` **after** this migration (already satisfied if your branch matches `main` / current repo).

## 4. Hosted mode smoke test

**Still manual:** with project URL + **`SUPABASE_SECRET_KEY`** (`sb_secret_...`) or legacy `SUPABASE_SERVICE_ROLE_KEY`, verify registration/login and one integration connect; confirm rows in `myassist.app_users` and `myassist.integration_tokens`.

**If REST calls fail with “schema not found”:** Dashboard → **Settings → API → Exposed schemas** — add **`myassist`** (and save) so PostgREST can serve `supabase.schema("myassist")` requests.

## 5. Local fallback smoke test

**PASS** — [`apps/web/lib/storageFallbackSmoke.test.ts`](../apps/web/lib/storageFallbackSmoke.test.ts): `npm run test -- --run lib/storageFallbackSmoke.test.ts`

## Final status

| Criterion | Status |
|-----------|--------|
| `myassist` schema + tables | **Done** |
| No legacy public MyAssist tables | **Done** |
| RLS enabled | **Done** |
| Index `integration_tokens_user_id_idx` | **Done** |
| Entitlements include `myassist` | **Done** |
| Hosted mode (app + smoke) | **You verify** after deploy + env |
| Fallback mode | **Verified** (automated) |

See also: [myassist-schema-segregation-readiness.md](./myassist-schema-segregation-readiness.md).
