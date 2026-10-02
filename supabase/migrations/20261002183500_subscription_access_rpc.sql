begin;

create or replace function public.current_subscription_access()
returns table(plan text, status text, renews_on date)
language sql
security definer
stable
set search_path = public
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
  )
  select s.plan, s.status, s.renews_on
  from public.subscriptions s
  join account_owner a on a.user_id = s.user_id
  limit 1
$$;

revoke all on function public.current_subscription_access() from public, anon;
grant execute on function public.current_subscription_access() to authenticated, service_role;

commit;
