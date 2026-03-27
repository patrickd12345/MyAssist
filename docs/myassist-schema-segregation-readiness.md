# MyAssist schema segregation — post-migration readiness

Verification notes after `20260328120000_myassist_schema_refactor.sql` and app changes to `myassist.app_users` / `myassist.integration_tokens`.

**PostgREST:** If you see `Invalid schema: myassist`, apply [`20260328140000_expose_myassist_schema_postgrest.sql`](../supabase/migrations/20260328140000_expose_myassist_schema_postgrest.sql) via [`supabase db push`](../supabase/README.md) (or paste into the SQL editor). The Supabase dashboard “exposed schemas” UI is optional once this migration has run.

## Migration blast-radius review

| Area | Assessment |
|------|------------|
| `CREATE SCHEMA IF NOT EXISTS myassist` | Idempotent; no impact on other product schemas. |
| Move from `public` | Guarded with `to_regclass`; only touches legacy `myassist_*` tables. Parent (`myassist_app_users`) moved before child. |
| Rename | Only when source exists and target name is free; avoids clobbering pre-migrated installs. |
| Greenfield `CREATE TABLE IF NOT EXISTS` | Safe when no legacy tables; matches prior column layout. |
| Index | Renames legacy index name when present; `CREATE INDEX IF NOT EXISTS` avoids duplicate after rename. |
| RLS | `ENABLE ROW LEVEL SECURITY` is idempotent; same posture as before (service role bypasses RLS). |
| `platform.entitlements` | Runs only if table exists. Drops a `CHECK` whose definition matches `product_key`/`IN` and lists `bookiji`/`kinetix`/`chess` but not `myassist`. Adds `platform_entitlements_product_key_check` only if that name is absent. **Residual risk:** if production uses a different `product_key` check shape (no `bookiji` substring, etc.), the old constraint may not be replaced—confirm with the verification SQL below. |

## Post-apply SQL verification

Run in the target database (SQL editor or `psql`) after migrations apply.

**1. Tables in `myassist`**

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'myassist'
  and table_name in ('app_users', 'integration_tokens')
order by table_name;
```

Expect two rows: `app_users`, `integration_tokens`.

**2. No legacy public MyAssist tables**

```sql
select table_schema, table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('myassist_app_users', 'myassist_integration_tokens');
```

Expect zero rows.

**3. RLS enabled**

```sql
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'myassist'
  and c.relname in ('app_users', 'integration_tokens')
  and c.relkind = 'r';
```

Expect `rls_enabled` = `true` for both.

**4. Index on `integration_tokens(user_id)`**

```sql
select indexname, indexdef
from pg_indexes
where schemaname = 'myassist'
  and tablename = 'integration_tokens'
  and indexname = 'integration_tokens_user_id_idx';
```

Expect one row.

**5. `platform.entitlements` product_key check includes `myassist`**

```sql
select c.conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class t on c.conrelid = t.oid
join pg_namespace n on t.relnamespace = n.oid
where n.nspname = 'platform'
  and t.relname = 'entitlements'
  and c.contype = 'c'
  and pg_get_constraintdef(c.oid) ilike '%product_key%';
```

Expect a row where `def` contains `'myassist'` (typically constraint `platform_entitlements_product_key_check`). If `platform.entitlements` does not exist (local-only DB), this query returns no rows—that is expected.

## Code / docs / scripts scan

- Hosted paths use `getSupabaseAdmin()` + `supabase.schema(MYASSIST_SCHEMA).from(...)` in [`apps/web/lib/userStoreSupabase.ts`](../apps/web/lib/userStoreSupabase.ts) and [`apps/web/lib/integrations/tokenStoreSupabase.ts`](../apps/web/lib/integrations/tokenStoreSupabase.ts).
- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY` appear only in server-side store tests and [`supabaseAdmin.ts`](../apps/web/lib/supabaseAdmin.ts)—not in client components.
- Automated guard: [`apps/web/lib/hostedSupabaseSchema.test.ts`](../apps/web/lib/hostedSupabaseSchema.test.ts) asserts schema-qualified access for `app_users` and `integration_tokens`.

## Apply order

1. Ensure prior migration [`20260327140000_myassist_hosted_storage.sql`](../supabase/migrations/20260327140000_myassist_hosted_storage.sql) has run if you rely on existing `public` tables (otherwise greenfield branch creates `myassist` tables directly).
2. Apply [`20260328120000_myassist_schema_refactor.sql`](../supabase/migrations/20260328120000_myassist_schema_refactor.sql).
3. Deploy app code that uses `MYASSIST_SCHEMA` **after** DB migration (or downtime window if you cannot coordinate).

## Rollback considerations

- **App-only rollback:** redeploy previous build still querying `public.myassist_*` only works if tables were not moved yet; after migration, old code will fail until DB is reverted.
- **DB rollback (manual):** rename tables back to `myassist_*`, `ALTER TABLE ... SET SCHEMA public`, restore original `platform.entitlements` check if it was dropped (recreate prior `IN (...)` list without `myassist` if required). Prefer restore from backup for shared production DB.
- **Non-destructive forward fix:** if something fails post-apply, fix forward (permissions, constraint, index) rather than partial undo on a shared spine.

## Blockers vs non-blockers

**Blockers (fix before trusting hosted auth + integrations on shared DB)**

- Migration not applied or apply order wrong vs app deploy.
- Verification queries show tables still in `public` or missing in `myassist`.
- `platform.entitlements` check does not list `myassist` but product code inserts `product_key = 'myassist'`.

**Non-blockers / operational**

- Local dev without `platform.entitlements`: migration skips platform section; app file fallback unchanged when Supabase env unset.
- RLS with no policies: same as before for service-role server access; review policies if you later expose these tables to PostgREST/anon.

## Local file fallback

Unchanged: when no project URL or no server secret key is set (`SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`), `getSupabaseAdmin()` returns `null` and [`userStore.ts`](../apps/web/lib/userStore.ts) / [`tokenStore.ts`](../apps/web/lib/integrations/tokenStore.ts) use file-backed storage.

Apply session log (shared DB): [bookiji-shared-supabase-apply-report.md](./bookiji-shared-supabase-apply-report.md).  
Hosted runtime verification: [hosted-runtime-verification-report.md](./hosted-runtime-verification-report.md).
