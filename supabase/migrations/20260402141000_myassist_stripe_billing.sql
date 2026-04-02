-- Stripe billing: webhook idempotency ledger + subscription rows (authority for paid status).
-- Apply via Supabase CLI (`supabase db push`).

create schema if not exists myassist;

create table if not exists myassist.stripe_event_log (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now(),
  event_id text not null unique,
  event_type text not null,
  processed_at timestamptz,
  status text not null default 'claimed',
  error text,
  product text not null default 'myassist',
  account_scope text not null default 'myassist'
);

create index if not exists stripe_event_log_event_id_idx
  on myassist.stripe_event_log (event_id);

create table if not exists myassist.billing_subscriptions (
  user_id uuid not null primary key references myassist.app_users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  stripe_price_id text,
  updated_at timestamptz not null default now()
);

create index if not exists billing_subscriptions_stripe_customer_idx
  on myassist.billing_subscriptions (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists billing_subscriptions_stripe_subscription_idx
  on myassist.billing_subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;
