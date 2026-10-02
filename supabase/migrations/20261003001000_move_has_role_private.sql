-- SECURITY: keep role checks available to RLS/triggers, but remove the helper
-- from the exposed public RPC schema.
begin;

create schema if not exists app_private;
revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated, service_role;

alter function public.has_role(uuid, public.app_role) set schema app_private;
alter function app_private.has_role(uuid, public.app_role) set search_path = public;

revoke all on function app_private.has_role(uuid, public.app_role) from public, anon;
grant execute on function app_private.has_role(uuid, public.app_role) to authenticated, service_role;

create or replace function public.is_account_active()
returns boolean
language sql
stable
security definer
set search_path = public, app_private
as $$
  select app_private.has_role(auth.uid(), 'admin')
      or not exists (
        select 1
          from public.account_approvals a
         where a.auth_user_id = auth.uid()
           and a.status in ('blocked', 'rejected')
      );
$$;

create or replace function public.sync_account_ban()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
declare
  target_user uuid;
begin
  if tg_op = 'DELETE' then
    if old.status in ('blocked', 'rejected')
       and not app_private.has_role(old.auth_user_id, 'admin') then
      update auth.users
         set banned_until = null
       where id = old.auth_user_id;
    end if;
    return old;
  end if;

  target_user := new.auth_user_id;

  if tg_op = 'UPDATE'
     and old.auth_user_id is distinct from new.auth_user_id
     and old.status in ('blocked', 'rejected')
     and not app_private.has_role(old.auth_user_id, 'admin') then
    update auth.users
       set banned_until = null
     where id = old.auth_user_id;
  end if;

  if app_private.has_role(target_user, 'admin') then
    update auth.users
       set banned_until = null
     where id = target_user;
    return new;
  end if;

  if new.status in ('blocked', 'rejected') then
    update auth.users
       set banned_until = now() + interval '100 years'
     where id = target_user;
  elsif tg_op = 'UPDATE' and old.status in ('blocked', 'rejected') then
    update auth.users
       set banned_until = null
     where id = target_user;
  end if;

  return new;
end
$$;

commit;
