-- SECURITY: keep the public subscription RPC as a caller-permission wrapper.
-- The privileged cross-owner lookup lives in the non-exposed app_private schema.
begin;

alter function public.current_subscription_access_unchecked() set schema app_private;
alter function app_private.current_subscription_access_unchecked()
  set search_path = public, app_private;

revoke all on function app_private.current_subscription_access_unchecked()
  from public, anon;
grant execute on function app_private.current_subscription_access_unchecked()
  to authenticated, service_role;

create or replace function public.current_subscription_access()
returns table(plan text, status text, renews_on date)
language plpgsql
stable
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;

  return query
    select *
    from app_private.current_subscription_access_unchecked();
end;
$$;

revoke all on function public.current_subscription_access() from public, anon;
grant execute on function public.current_subscription_access() to authenticated, service_role;

commit;
