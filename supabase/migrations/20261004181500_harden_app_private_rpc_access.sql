-- Harden private RPC implementation functions.
-- Public RPC wrappers remain the only authenticated entry points. They check
-- app_private.is_account_active() before calling the unchecked implementation.

alter function public.create_storno(uuid, text)
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.current_subscription_access()
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.finalize_document(uuid)
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.list_trash()
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.next_customer_number()
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.next_document_number(text)
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.purge_entity(text, uuid)
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.restore_entity(text, uuid)
  security definer
  set search_path = pg_catalog, public, app_private;

alter function public.trash_entity(text, uuid)
  security definer
  set search_path = pg_catalog, public, app_private;

revoke execute on function app_private.create_storno_unchecked(uuid, text) from authenticated;
revoke execute on function app_private.current_subscription_access_unchecked() from authenticated;
revoke execute on function app_private.finalize_document_unchecked(uuid) from authenticated;
revoke execute on function app_private.list_trash_unchecked() from authenticated;
revoke execute on function app_private.next_customer_number_unchecked() from authenticated;
revoke execute on function app_private.next_document_number_unchecked(text) from authenticated;
revoke execute on function app_private.purge_entity_unchecked(text, uuid) from authenticated;
revoke execute on function app_private.restore_entity_unchecked(text, uuid) from authenticated;
revoke execute on function app_private.trash_entity_unchecked(text, uuid) from authenticated;
revoke execute on function app_private.has_role(uuid, public.app_role) from authenticated;

-- RLS policies call this helper directly, so authenticated must keep EXECUTE.
grant execute on function app_private.is_account_active() to authenticated;
