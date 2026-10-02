-- SECURITY: Block stale JWTs from reaching SECURITY DEFINER RPCs after an
-- account has been blocked/rejected. RLS is bypassed inside these functions,
-- so the account-state check must happen before entering the privileged body.
begin;

-- Preserve the reviewed privileged bodies under non-RPC names, revoke direct
-- execution, then expose guarded wrappers under the original RPC names.

alter function public.finalize_document(uuid) rename to finalize_document_unchecked;
revoke all on function public.finalize_document_unchecked(uuid) from public, anon, authenticated;

create or replace function public.finalize_document(_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.finalize_document_unchecked(_id);
end;
$$;

do $
begin
  if to_regprocedure('public.create_storno(uuid,text)') is not null then
    execute 'alter function public.create_storno(uuid,text) rename to create_storno_unchecked';
    execute 'revoke all on function public.create_storno_unchecked(uuid,text) from public, anon, authenticated';

    execute $fn$
      create function public.create_storno(_id uuid, _reason text default '')
      returns uuid
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if not public.is_account_active() then
          raise exception 'Konto gesperrt' using errcode = '42501';
        end if;
        return public.create_storno_unchecked(_id, _reason);
      end;
      $body$
    $fn$;
  elsif to_regprocedure('public.create_storno(uuid)') is not null then
    execute 'alter function public.create_storno(uuid) rename to create_storno_unchecked';
    execute 'revoke all on function public.create_storno_unchecked(uuid) from public, anon, authenticated';

    execute $fn$
      create function public.create_storno(_id uuid)
      returns uuid
      language plpgsql
      security definer
      set search_path = public
      as $body$
      begin
        if not public.is_account_active() then
          raise exception 'Konto gesperrt' using errcode = '42501';
        end if;
        return public.create_storno_unchecked(_id);
      end;
      $body$
    $fn$;
  else
    raise exception 'create_storno RPC not found';
  end if;
end
$;

alter function public.next_customer_number() rename to next_customer_number_unchecked;
revoke all on function public.next_customer_number_unchecked() from public, anon, authenticated;

create or replace function public.next_customer_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.next_customer_number_unchecked();
end;
$$;

alter function public.next_document_number(text) rename to next_document_number_unchecked;
revoke all on function public.next_document_number_unchecked(text) from public, anon, authenticated;

create or replace function public.next_document_number(_kind text)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.next_document_number_unchecked(_kind);
end;
$$;

alter function public.trash_entity(text, uuid) rename to trash_entity_unchecked;
revoke all on function public.trash_entity_unchecked(text, uuid) from public, anon, authenticated;

create or replace function public.trash_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.trash_entity_unchecked(_entity, _id);
end;
$$;

alter function public.restore_entity(text, uuid) rename to restore_entity_unchecked;
revoke all on function public.restore_entity_unchecked(text, uuid) from public, anon, authenticated;

create or replace function public.restore_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.restore_entity_unchecked(_entity, _id);
end;
$$;

alter function public.purge_entity(text, uuid) rename to purge_entity_unchecked;
revoke all on function public.purge_entity_unchecked(text, uuid) from public, anon, authenticated;

create or replace function public.purge_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.purge_entity_unchecked(_entity, _id);
end;
$$;

alter function public.link_employee_account() rename to link_employee_account_unchecked;
revoke all on function public.link_employee_account_unchecked() from public, anon, authenticated;

create or replace function public.link_employee_account()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.link_employee_account_unchecked();
end;
$$;

alter function public.list_trash() rename to list_trash_unchecked;
revoke all on function public.list_trash_unchecked() from public, anon, authenticated;

create or replace function public.list_trash()
returns table(entity text, id uuid, label text, info text, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return query select * from public.list_trash_unchecked();
end;
$$;

alter function public.current_subscription_access() rename to current_subscription_access_unchecked;
revoke all on function public.current_subscription_access_unchecked() from public, anon, authenticated;

create or replace function public.current_subscription_access()
returns table(plan text, status text, renews_on date)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return query select * from public.current_subscription_access_unchecked();
end;
$$;

-- RPC exposure is intentional only through the guarded names.
revoke all on function public.finalize_document(uuid) from public, anon;
grant execute on function public.finalize_document(uuid) to authenticated, service_role;
do $
begin
  if to_regprocedure('public.create_storno(uuid,text)') is not null then
    execute 'revoke all on function public.create_storno(uuid,text) from public, anon';
    execute 'grant execute on function public.create_storno(uuid,text) to authenticated, service_role';
  elsif to_regprocedure('public.create_storno(uuid)') is not null then
    execute 'revoke all on function public.create_storno(uuid) from public, anon';
    execute 'grant execute on function public.create_storno(uuid) to authenticated, service_role';
  else
    raise exception 'guarded create_storno RPC not found';
  end if;
end
$;
revoke all on function public.next_customer_number() from public, anon;
grant execute on function public.next_customer_number() to authenticated, service_role;
revoke all on function public.next_document_number(text) from public, anon;
grant execute on function public.next_document_number(text) to authenticated, service_role;
revoke all on function public.trash_entity(text, uuid) from public, anon;
grant execute on function public.trash_entity(text, uuid) to authenticated, service_role;
revoke all on function public.restore_entity(text, uuid) from public, anon;
grant execute on function public.restore_entity(text, uuid) to authenticated, service_role;
revoke all on function public.purge_entity(text, uuid) from public, anon;
grant execute on function public.purge_entity(text, uuid) to authenticated, service_role;
revoke all on function public.link_employee_account() from public, anon;
grant execute on function public.link_employee_account() to authenticated, service_role;
revoke all on function public.list_trash() from public, anon;
grant execute on function public.list_trash() to authenticated, service_role;
revoke all on function public.current_subscription_access() from public, anon;
grant execute on function public.current_subscription_access() to authenticated, service_role;

commit;
