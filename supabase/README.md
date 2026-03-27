# MyAssist Supabase migrations

SQL in `migrations/` targets the **shared Bookiji** Supabase project (same DB as Kinetix; `myassist` schema).

## CLI: login and link

From the **repository root**:

```bash
npx supabase login
npx supabase link --project-ref <project-ref>
```

`<project-ref>`: Dashboard → **Project Settings → General → Reference ID**.

**If CLI says `Invalid access token format`:** unset `SUPABASE_ACCESS_TOKEN` in your shell if it is not a Supabase CLI token (`sbp_…`). That variable is unrelated to the database and breaks `supabase projects list` / `link`.

## Applying migrations to hosted (this repo)

The shared database already has **hundreds** of migrations from other apps. This repo only ships a few files, so **`supabase db push` usually fails** with “Remote migration versions not found in local migrations directory.”

**Use `db query` against the linked project** instead:

```bash
npx supabase db query --linked -f supabase/migrations/<file>.sql
```

After changing PostgREST exposure or new tables, refresh the schema cache:

```bash
npx supabase db query --linked "NOTIFY pgrst, 'reload schema';"
```

If you still see stale errors, try:

```bash
npx supabase db query --linked "NOTIFY pgrst, 'reload config';"
```

## PostgREST / `Invalid schema: myassist`

Apply `20260328140000_expose_myassist_schema_postgrest.sql` with `db query --linked -f …` as above, then `NOTIFY pgrst, 'reload schema'`.

## Local

`config.toml` lists exposed API schemas for `supabase start`, including `myassist` for parity with hosted.
