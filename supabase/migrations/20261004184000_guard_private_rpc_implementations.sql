-- Keep public Data API RPCs SECURITY INVOKER and put the privileged boundary
-- inside app_private. Authenticated callers can execute only guarded private
-- wrappers; the core implementations stay unreachable to Data API roles.

alter function public.create_storno(uuid, text) security invoker;
alter function public.current_subscription_access() security invoker;
alter function public.finalize_document(uuid) security invoker;
alter function public.list_trash() security invoker;
alter function public.next_customer_number() security invoker;
alter function public.next_document_number(text) security invoker;
alter function public.purge_entity(text, uuid) security invoker;
alter function public.restore_entity(text, uuid) security invoker;
alter function public.trash_entity(text, uuid) security invoker;

alter function app_private.create_storno_unchecked(uuid, text) rename to create_storno_core;
alter function app_private.current_subscription_access_unchecked() rename to current_subscription_access_core;
alter function app_private.finalize_document_unchecked(uuid) rename to finalize_document_core;
alter function app_private.list_trash_unchecked() rename to list_trash_core;
alter function app_private.next_customer_number_unchecked() rename to next_customer_number_core;
alter function app_private.next_document_number_unchecked(text) rename to next_document_number_core;
alter function app_private.purge_entity_unchecked(text, uuid) rename to purge_entity_core;
alter function app_private.restore_entity_unchecked(text, uuid) rename to restore_entity_core;
alter function app_private.trash_entity_unchecked(text, uuid) rename to trash_entity_core;

revoke all on function app_private.create_storno_core(uuid, text) from public, anon, authenticated;
revoke all on function app_private.current_subscription_access_core() from public, anon, authenticated;
revoke all on function app_private.finalize_document_core(uuid) from public, anon, authenticated;
revoke all on function app_private.list_trash_core() from public, anon, authenticated;
revoke all on function app_private.next_customer_number_core() from public, anon, authenticated;
revoke all on function app_private.next_document_number_core(text) from public, anon, authenticated;
revoke all on function app_private.purge_entity_core(text, uuid) from public, anon, authenticated;
revoke all on function app_private.restore_entity_core(text, uuid) from public, anon, authenticated;
revoke all on function app_private.trash_entity_core(text, uuid) from public, anon, authenticated;

create function app_private.create_storno_unchecked(_id uuid, _reason text default ''::text)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return app_private.create_storno_core(_id, _reason);
end;
$$;

create function app_private.current_subscription_access_unchecked()
returns table(plan text, status text, renews_on date)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return query select * from app_private.current_subscription_access_core();
end;
$$;

create function app_private.finalize_document_unchecked(_id uuid)
returns public.documents
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return app_private.finalize_document_core(_id);
end;
$$;

create function app_private.list_trash_unchecked()
returns table(entity text, id uuid, label text, info text, deleted_at timestamptz)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return query select * from app_private.list_trash_core();
end;
$$;

create function app_private.next_customer_number_unchecked()
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return app_private.next_customer_number_core();
end;
$$;

create function app_private.next_document_number_unchecked(_kind text)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  return app_private.next_document_number_core(_kind);
end;
$$;

create function app_private.purge_entity_unchecked(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  perform app_private.purge_entity_core(_entity, _id);
end;
$$;

create function app_private.restore_entity_unchecked(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  perform app_private.restore_entity_core(_entity, _id);
end;
$$;

create function app_private.trash_entity_unchecked(_entity text, _id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if not app_private.is_account_active() then
    raise exception 'Konto ist nicht aktiv';
  end if;
  perform app_private.trash_entity_core(_entity, _id);
end;
$$;

revoke all on function app_private.create_storno_unchecked(uuid, text) from public, anon;
revoke all on function app_private.current_subscription_access_unchecked() from public, anon;
revoke all on function app_private.finalize_document_unchecked(uuid) from public, anon;
revoke all on function app_private.list_trash_unchecked() from public, anon;
revoke all on function app_private.next_customer_number_unchecked() from public, anon;
revoke all on function app_private.next_document_number_unchecked(text) from public, anon;
revoke all on function app_private.purge_entity_unchecked(text, uuid) from public, anon;
revoke all on function app_private.restore_entity_unchecked(text, uuid) from public, anon;
revoke all on function app_private.trash_entity_unchecked(text, uuid) from public, anon;

grant execute on function app_private.create_storno_unchecked(uuid, text) to authenticated;
grant execute on function app_private.current_subscription_access_unchecked() to authenticated;
grant execute on function app_private.finalize_document_unchecked(uuid) to authenticated;
grant execute on function app_private.list_trash_unchecked() to authenticated;
grant execute on function app_private.next_customer_number_unchecked() to authenticated;
grant execute on function app_private.next_document_number_unchecked(text) to authenticated;
grant execute on function app_private.purge_entity_unchecked(text, uuid) to authenticated;
grant execute on function app_private.restore_entity_unchecked(text, uuid) to authenticated;
grant execute on function app_private.trash_entity_unchecked(text, uuid) to authenticated;
