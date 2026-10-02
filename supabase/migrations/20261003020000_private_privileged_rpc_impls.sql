-- SECURITY: expose only SECURITY INVOKER RPC wrappers in public.
-- Privileged implementations live in app_private, which is not exposed by the Data API.
begin;

alter function public.finalize_document_unchecked(uuid) set schema app_private;
alter function public.create_storno_unchecked(uuid, text) set schema app_private;
alter function public.next_customer_number_unchecked() set schema app_private;
alter function public.next_document_number_unchecked(text) set schema app_private;
alter function public.trash_entity_unchecked(text, uuid) set schema app_private;
alter function public.restore_entity_unchecked(text, uuid) set schema app_private;
alter function public.purge_entity_unchecked(text, uuid) set schema app_private;
alter function public.list_trash_unchecked() set schema app_private;

alter function app_private.finalize_document_unchecked(uuid) set search_path = public, app_private;
alter function app_private.create_storno_unchecked(uuid, text) set search_path = public, app_private;
alter function app_private.next_customer_number_unchecked() set search_path = public, app_private;
alter function app_private.next_document_number_unchecked(text) set search_path = public, app_private;
alter function app_private.trash_entity_unchecked(text, uuid) set search_path = public, app_private;
alter function app_private.restore_entity_unchecked(text, uuid) set search_path = public, app_private;
alter function app_private.purge_entity_unchecked(text, uuid) set search_path = public, app_private;
alter function app_private.list_trash_unchecked() set search_path = public, app_private;

revoke all on function app_private.finalize_document_unchecked(uuid) from public, anon;
revoke all on function app_private.create_storno_unchecked(uuid, text) from public, anon;
revoke all on function app_private.next_customer_number_unchecked() from public, anon;
revoke all on function app_private.next_document_number_unchecked(text) from public, anon;
revoke all on function app_private.trash_entity_unchecked(text, uuid) from public, anon;
revoke all on function app_private.restore_entity_unchecked(text, uuid) from public, anon;
revoke all on function app_private.purge_entity_unchecked(text, uuid) from public, anon;
revoke all on function app_private.list_trash_unchecked() from public, anon;

grant execute on function app_private.finalize_document_unchecked(uuid) to authenticated, service_role;
grant execute on function app_private.create_storno_unchecked(uuid, text) to authenticated, service_role;
grant execute on function app_private.next_customer_number_unchecked() to authenticated, service_role;
grant execute on function app_private.next_document_number_unchecked(text) to authenticated, service_role;
grant execute on function app_private.trash_entity_unchecked(text, uuid) to authenticated, service_role;
grant execute on function app_private.restore_entity_unchecked(text, uuid) to authenticated, service_role;
grant execute on function app_private.purge_entity_unchecked(text, uuid) to authenticated, service_role;
grant execute on function app_private.list_trash_unchecked() to authenticated, service_role;

create or replace function public.finalize_document(_id uuid)
returns public.documents
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return app_private.finalize_document_unchecked(_id);
end;
$$;

create or replace function public.create_storno(_id uuid, _reason text default '')
returns uuid
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return app_private.create_storno_unchecked(_id, _reason);
end;
$$;

create or replace function public.next_customer_number()
returns text
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return app_private.next_customer_number_unchecked();
end;
$$;

create or replace function public.next_document_number(_kind text)
returns text
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return app_private.next_document_number_unchecked(_kind);
end;
$$;

create or replace function public.trash_entity(_entity text, _id uuid)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform app_private.trash_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.restore_entity(_entity text, _id uuid)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform app_private.restore_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.purge_entity(_entity text, _id uuid)
returns void
language plpgsql
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  perform app_private.purge_entity_unchecked(_entity, _id);
end;
$$;

create or replace function public.list_trash()
returns table(entity text, id uuid, label text, info text, deleted_at timestamptz)
language plpgsql
stable
security invoker
set search_path = public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto gesperrt' using errcode = '42501';
  end if;
  return query select * from app_private.list_trash_unchecked();
end;
$$;

revoke all on function public.finalize_document(uuid) from public, anon;
grant execute on function public.finalize_document(uuid) to authenticated, service_role;
revoke all on function public.create_storno(uuid, text) from public, anon;
grant execute on function public.create_storno(uuid, text) to authenticated, service_role;
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
revoke all on function public.list_trash() from public, anon;
grant execute on function public.list_trash() to authenticated, service_role;

commit;
