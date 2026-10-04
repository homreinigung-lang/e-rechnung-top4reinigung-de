alter table if exists public.subscriptions
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_status text,
  add column if not exists billing_interval text;

create unique index if not exists subscriptions_stripe_subscription_id_key
  on public.subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

alter table if exists public.plan_orders
  add column if not exists stripe_checkout_session_id text,
  add column if not exists payment_status text not null default 'pending';

create unique index if not exists plan_orders_stripe_checkout_session_id_key
  on public.plan_orders (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on column public.subscriptions.stripe_customer_id is 'Stripe customer ID; server-managed only.';
comment on column public.subscriptions.stripe_subscription_id is 'Stripe recurring subscription ID; server-managed only.';
comment on column public.subscriptions.stripe_status is 'Last known Stripe subscription/payment state.';
comment on column public.subscriptions.billing_interval is 'monthly or yearly, synchronized from Stripe metadata.';
comment on column public.plan_orders.payment_status is 'pending, checkout_completed, paid or payment_failed.';
