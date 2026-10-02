begin;

alter table public.plan_orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null,
  add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null,
  add column if not exists employee_count integer not null default 0 check (employee_count >= 0);

create index if not exists plan_orders_customer_user_idx
  on public.plan_orders(customer_user_id, created_at desc);
create index if not exists plan_orders_subscription_idx
  on public.plan_orders(subscription_id, created_at desc);

-- Keep the launch catalog intentionally limited to the three supported package codes.
alter table public.plans drop constraint if exists plans_supported_code_check;
alter table public.plans
  add constraint plans_supported_code_check
  check (code in ('basis','pro','enterprise'));

alter table public.subscriptions drop constraint if exists subscriptions_supported_plan_check;
alter table public.subscriptions
  add constraint subscriptions_supported_plan_check
  check (plan in ('basis','pro','enterprise'));

commit;
