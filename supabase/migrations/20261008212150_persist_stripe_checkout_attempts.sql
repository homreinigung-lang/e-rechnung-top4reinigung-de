-- One immutable pending attempt per subscription/environment, shared by all workers.
-- This is server-only state and contains no Stripe credentials.
create table public.stripe_checkout_attempts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  billing_mode text not null check (billing_mode in ('sandbox', 'live')),
  input jsonb not null,
  order_data jsonb not null,
  session_id text,
  created_at timestamptz not null default now(),
  unique (subscription_id, billing_mode)
);
alter table public.stripe_checkout_attempts enable row level security;
revoke all on public.stripe_checkout_attempts from public, anon, authenticated;
grant select, insert, update, delete on public.stripe_checkout_attempts to service_role;
comment on table public.stripe_checkout_attempts is 'Server-only immutable Checkout reservation; retains unknown outcomes for idempotent retries.';

create policy "Gesperrte Konten ausgeschlossen" on public.stripe_checkout_attempts
as restrictive for all to authenticated
using ((select app_private.is_account_active()))
with check ((select app_private.is_account_active()));
