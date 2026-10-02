begin;

-- Trigger function: pin search_path so object resolution cannot be influenced by caller context.
alter function public.guard_company_accounting_chart_change()
  set search_path = public;

-- Explicitly deny anonymous/public execution for security-definer RPCs.
-- Authenticated execution stays only where the application/RLS intentionally needs it.
revoke all on function public.create_storno(uuid) from public, anon;
revoke all on function public.current_subscription_access() from public, anon;
revoke all on function public.finalize_document(uuid) from public, anon;
revoke all on function public.has_role(uuid, public.app_role) from public, anon;
revoke all on function public.is_account_active() from public, anon;
revoke all on function public.link_employee_account() from public, anon;
revoke all on function public.list_trash() from public, anon;
revoke all on function public.next_customer_number() from public, anon;
revoke all on function public.next_document_number(text) from public, anon;
revoke all on function public.owns_document(uuid) from public, anon;
revoke all on function public.purge_entity(text, uuid) from public, anon;
revoke all on function public.restore_entity(text, uuid) from public, anon;
revoke all on function public.trash_entity(text, uuid) from public, anon;

grant execute on function public.create_storno(uuid) to authenticated, service_role;
grant execute on function public.current_subscription_access() to authenticated, service_role;
grant execute on function public.finalize_document(uuid) to authenticated, service_role;
grant execute on function public.has_role(uuid, public.app_role) to authenticated, service_role;
grant execute on function public.is_account_active() to authenticated, service_role;
grant execute on function public.link_employee_account() to authenticated, service_role;
grant execute on function public.list_trash() to authenticated, service_role;
grant execute on function public.next_customer_number() to authenticated, service_role;
grant execute on function public.next_document_number(text) to authenticated, service_role;
grant execute on function public.owns_document(uuid) to authenticated, service_role;
grant execute on function public.purge_entity(text, uuid) to authenticated, service_role;
grant execute on function public.restore_entity(text, uuid) to authenticated, service_role;
grant execute on function public.trash_entity(text, uuid) to authenticated, service_role;

commit;
