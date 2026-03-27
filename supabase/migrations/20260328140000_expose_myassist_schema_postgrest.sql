-- Expose myassist to the Data API (PostgREST), same idea as Bookiji's expose_platform_bookiji_schemas.
-- Without this: "Invalid schema: myassist" / PGRST106 when using supabase.schema('myassist').
--
-- Apply to hosted Bookiji (shared) database (this repo cannot use `db push`; see supabase/README.md):
--   npx supabase db query --linked -f supabase/migrations/20260328140000_expose_myassist_schema_postgrest.sql
--   npx supabase db query --linked "NOTIFY pgrst, 'reload schema';"

grant usage on schema myassist to anon, authenticated, service_role;

grant all on all tables in schema myassist to anon, authenticated, service_role;
grant all on all routines in schema myassist to anon, authenticated, service_role;
grant all on all sequences in schema myassist to anon, authenticated, service_role;

alter default privileges for role postgres in schema myassist
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema myassist
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema myassist
  grant all on sequences to anon, authenticated, service_role;

-- Keep prior Bookiji shared schemas and add myassist (order does not matter for PostgREST).
alter role authenticator
  set pgrst.db_schemas = 'public, graphql_public, platform, bookiji, kinetix, chess, myassist';

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
