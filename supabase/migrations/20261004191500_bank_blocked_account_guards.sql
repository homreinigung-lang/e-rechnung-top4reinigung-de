begin;
create policy "Gesperrte Konten ausgeschlossen"
on public.enable_banking_auth_states as restrictive for all to authenticated
using ((select app_private.is_account_active()))
with check ((select app_private.is_account_active()));
create policy "Gesperrte Konten ausgeschlossen"
on public.enable_banking_payments as restrictive for all to authenticated
using ((select app_private.is_account_active()))
with check ((select app_private.is_account_active()));
alter function public.enable_banking_access() set schema app_private;
revoke all on function app_private.enable_banking_access() from public, anon;
grant execute on function app_private.enable_banking_access() to authenticated, service_role;
create function public.enable_banking_access()
returns boolean language sql stable security invoker set search_path = ''
as 'select app_private.enable_banking_access()';
revoke all on function public.enable_banking_access() from public, anon;
grant execute on function public.enable_banking_access() to authenticated, service_role;
commit;

