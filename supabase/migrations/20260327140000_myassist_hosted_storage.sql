-- Hosted storage for MyAssist (Path A: durable users + per-user integration rows).
-- Apply via Supabase CLI (`supabase db push`) or Dashboard SQL after project is active.
-- Server uses SUPABASE_SERVICE_ROLE_KEY only; never expose to the browser.

create table if not exists public.myassist_app_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  todoist_api_token text,
  password_reset_token_hash text,
  password_reset_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.myassist_integration_tokens (
  user_id uuid not null references public.myassist_app_users(id) on delete cascade,
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

create index if not exists myassist_integration_tokens_user_id_idx
  on public.myassist_integration_tokens (user_id);

alter table public.myassist_app_users enable row level security;
alter table public.myassist_integration_tokens enable row level security;
