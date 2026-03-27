-- Segregate MyAssist tables into schema `myassist` with short table names.
-- Compatible with: legacy `public.myassist_*` from 20260327140000, fresh DBs, and shared Bookiji platform DB.

create schema if not exists myassist;

-- Move legacy public tables (parent first).
do $$
begin
  if to_regclass('public.myassist_app_users') is not null then
    execute 'alter table public.myassist_app_users set schema myassist';
  end if;
  if to_regclass('public.myassist_integration_tokens') is not null then
    execute 'alter table public.myassist_integration_tokens set schema myassist';
  end if;
end $$;

-- Rename to app_users / integration_tokens when old names still exist.
do $$
begin
  if to_regclass('myassist.myassist_app_users') is not null
     and to_regclass('myassist.app_users') is null then
    execute 'alter table myassist.myassist_app_users rename to app_users';
  end if;
  if to_regclass('myassist.myassist_integration_tokens') is not null
     and to_regclass('myassist.integration_tokens') is null then
    execute 'alter table myassist.myassist_integration_tokens rename to integration_tokens';
  end if;
end $$;

-- Normalize index name after table rename (legacy index name referenced old table).
do $$
begin
  if exists (
    select 1
    from pg_indexes
    where schemaname = 'myassist'
      and indexname = 'myassist_integration_tokens_user_id_idx'
  ) then
    execute 'alter index myassist.myassist_integration_tokens_user_id_idx rename to integration_tokens_user_id_idx';
  end if;
end $$;

-- Fresh installs without legacy public tables: create in myassist.
create table if not exists myassist.app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  todoist_api_token text,
  password_reset_token_hash text,
  password_reset_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists myassist.integration_tokens (
  user_id uuid not null references myassist.app_users (id) on delete cascade,
  provider text not null check (provider in ('gmail', 'todoist', 'google_calendar')),
  status text not null,
  encrypted_payload text not null,
  scopes text[] not null default '{}',
  connected_at timestamptz not null,
  updated_at timestamptz not null default now(),
  refresh_last_used_at timestamptz,
  revoked_at timestamptz,
  primary key (user_id, provider)
);

create index if not exists integration_tokens_user_id_idx
  on myassist.integration_tokens (user_id);

alter table myassist.app_users enable row level security;
alter table myassist.integration_tokens enable row level security;

-- Shared platform: allow product_key `myassist` on platform.entitlements (see platform_spine_v1_inert_foundation).
-- Discover the CHECK on product_key and replace with an expanded list; do not assume Postgres-generated constraint names.
do $$
declare
  cname text;
  def text;
begin
  if to_regclass('platform.entitlements') is null then
    return;
  end if;
  for cname, def in
    select c.conname::text, pg_get_constraintdef(c.oid)
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'platform'
      and t.relname = 'entitlements'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%product_key%in%'
  loop
    if def like '%bookiji%'
       and def like '%kinetix%'
       and def not like '%myassist%' then
      execute format('alter table platform.entitlements drop constraint %I', cname);
    end if;
  end loop;
exception
  when undefined_object then
    null;
end $$;

do $$
begin
  if to_regclass('platform.entitlements') is null then
    return;
  end if;
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on t.relnamespace = n.oid
    where n.nspname = 'platform'
      and t.relname = 'entitlements'
      and c.contype = 'c'
      and c.conname = 'platform_entitlements_product_key_check'
  ) then
    alter table platform.entitlements
      add constraint platform_entitlements_product_key_check
      check (product_key in ('bookiji', 'kinetix', 'chess', 'myassist'));
  end if;
end $$;
