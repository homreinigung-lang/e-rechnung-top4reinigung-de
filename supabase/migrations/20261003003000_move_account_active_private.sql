-- SECURITY: keep blocked-account evaluation available to RLS and privileged
-- wrappers, but remove it from the exposed public RPC schema.
begin;

alter function public.is_account_active() set schema app_private;
alter function app_private.is_account_active() set search_path = public, app_private;

revoke all on function app_private.is_account_active() from public, anon;
grant execute on function app_private.is_account_active() to authenticated, service_role;

create or replace function public.finalize_document(_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.finalize_document_unchecked(_id);
end;
$$;

create or replace function public.create_storno(_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.create_storno_unchecked(_id);
end;
$$;

create or replace function public.next_customer_number()
returns text
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.next_customer_number_unchecked();
end;
$$;

create or replace function public.next_document_number(_kind text)
returns text
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.next_document_number_unchecked(_kind);
end;
$$;

create or replace function public.trash_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.trash_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.restore_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.restore_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.purge_entity(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform public.purge_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.link_employee_account()
returns uuid
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return public.link_employee_account_unchecked();
end;
$$;

create or replace function public.list_trash()
returns table(entity text, id uuid, label text, info text, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return query select * from public.list_trash_unchecked();
end;
$$;

create or replace function public.current_subscription_access()
returns table(plan text, status text, renews_on date)
language plpgsql
stable
security definer
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return query select * from public.current_subscription_access_unchecked();
end;
$$;

commit;
