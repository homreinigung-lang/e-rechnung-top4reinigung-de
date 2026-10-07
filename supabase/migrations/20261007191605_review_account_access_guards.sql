begin;

alter table public.account_approvals add column deletion_started_at timestamptz;
comment on column public.account_approvals.deletion_started_at is
  'Keeps a company blocked while Auth deletion or retryable cleanup is in progress.';

-- SECURITY DEFINER is needed to inspect the parent company's status without
-- granting employees direct access to company approvals or auth.users.
create or replace function app_private.is_account_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and exists(select 1 from auth.users u where u.id = auth.uid())
    and (
      app_private.has_role(auth.uid(), 'admin'::public.app_role)
      or (
        not exists(select 1 from auth.users u where u.id = auth.uid() and u.banned_until > now())
        and not exists(
          select 1 from public.account_approvals a where a.auth_user_id = auth.uid()
            and (a.status in ('blocked','rejected') or a.deletion_started_at is not null)
        )
        and not exists(
          select 1 from public.employees e
          where e.auth_user_id = auth.uid() and e.user_id <> auth.uid()
            and (
              not e.active
              or not exists(select 1 from auth.users owner where owner.id = e.user_id)
              or (
                not app_private.has_role(e.user_id, 'admin'::public.app_role)
                and (
                  exists(select 1 from auth.users owner where owner.id = e.user_id and owner.banned_until > now())
                  or exists(select 1 from public.account_approvals a where a.auth_user_id = e.user_id
                    and (a.status in ('blocked','rejected') or a.deletion_started_at is not null))
                )
              )
            )
        )
      )
    );
$$;
revoke all on function app_private.is_account_active() from public, anon;
grant execute on function app_private.is_account_active() to authenticated, service_role;

-- A narrow, caller-only API for route guards and privileged server functions.
create function app_private.get_account_access_status() returns text
language sql stable security definer set search_path = '' as $$
  select case when not app_private.is_account_active() then 'blocked'
    else coalesce((select a.status from public.account_approvals a where a.auth_user_id = auth.uid()), 'none') end;
$$;
revoke all on function app_private.get_account_access_status() from public, anon;
grant execute on function app_private.get_account_access_status() to authenticated;
create function public.get_account_access_status() returns text
language sql stable security invoker set search_path = '' as $$
  select app_private.get_account_access_status();
$$;
revoke all on function public.get_account_access_status() from public, anon;
grant execute on function public.get_account_access_status() to authenticated;

create function app_private.prepare_company_account_deletion(_approval_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if auth.uid() is null or not app_private.is_account_active()
     or not app_private.has_role(auth.uid(), 'admin'::public.app_role) then
    raise exception 'Nur Administratoren dürfen Konten löschen.';
  end if;
  select a.auth_user_id into target from public.account_approvals a
    where a.id = _approval_id for update;
  if target is null then raise exception 'Konto nicht gefunden.'; end if;
  if target = auth.uid() or app_private.has_role(target, 'admin'::public.app_role) then
    raise exception 'Administrationskonten können nicht gelöscht werden.';
  end if;
  update public.account_approvals set status = 'blocked',
    deletion_started_at = coalesce(deletion_started_at, clock_timestamp()), decided_at = clock_timestamp()
    where id = _approval_id;
  return target;
end;
$$;
revoke all on function app_private.prepare_company_account_deletion(uuid) from public, anon;
grant execute on function app_private.prepare_company_account_deletion(uuid) to authenticated;
create function public.prepare_company_account_deletion(_approval_id uuid) returns uuid
language sql security invoker set search_path = '' as $$
  select app_private.prepare_company_account_deletion(_approval_id);
$$;
revoke all on function public.prepare_company_account_deletion(uuid) from public, anon;
grant execute on function public.prepare_company_account_deletion(uuid) to authenticated;

create function app_private.guard_company_deletion() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if old.deletion_started_at is not null and
    (new.deletion_started_at is distinct from old.deletion_started_at
     or new.auth_user_id is distinct from old.auth_user_id or new.status <> 'blocked') then
    raise exception 'Die Kontolöschung wurde begonnen. Bitte Löschung erneut versuchen; eine Freigabe ist nicht möglich.';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_company_deletion() from public, anon, authenticated;
create trigger guard_company_deletion before update on public.account_approvals
for each row execute function app_private.guard_company_deletion();

commit;
