-- Employees use the subscription of their owning company account.
-- If that company owner is the platform Master/Admin account, access is permanent
-- and must not inherit a stale trial/renewal date from the subscriptions table.
begin;

create or replace function app_private.current_subscription_access_unchecked()
returns table(plan text, status text, renews_on date)
language sql
stable
security definer
set search_path = public, app_private
as $$
  with account_owner as (
    select coalesce(
      (
        select e.user_id
        from public.employees e
        where e.auth_user_id = (select auth.uid())
        limit 1
      ),
      (select auth.uid())
    ) as user_id
  ),
  resolved_owner as (
    select
      a.user_id,
      exists (
        select 1
        from public.user_roles ur
        where ur.user_id = a.user_id
          and ur.role = 'admin'
      ) as is_admin
    from account_owner a
  )
  select
    case when o.is_admin then 'enterprise'::text else s.plan end as plan,
    case when o.is_admin then 'active'::text else s.status end as status,
    case when o.is_admin then null::date else s.renews_on end as renews_on
  from resolved_owner o
  left join public.subscriptions s on s.user_id = o.user_id
  where o.is_admin or s.user_id is not null
  limit 1
$$;

revoke all on function app_private.current_subscription_access_unchecked() from public, anon, authenticated;
grant execute on function app_private.current_subscription_access_unchecked() to service_role;

commit;
