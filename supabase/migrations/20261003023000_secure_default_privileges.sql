-- SECURITY: new application objects in exposed schemas must be private by default.
-- Explicit GRANT statements in each migration opt objects into Data API access.
--
-- Harden the role that actually executes application migrations. On hosted
-- Supabase this is postgres; in CI it is the isolated security_test role.
begin;

do $secure_defaults$
declare
  role_name text := current_user;
begin
  execute format(
    'alter default privileges for role %I in schema public revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated, service_role',
    role_name
  );
  execute format(
    'alter default privileges for role %I in schema public revoke execute on functions from public, anon, authenticated, service_role',
    role_name
  );
  execute format(
    'alter default privileges for role %I in schema public revoke usage, select, update on sequences from anon, authenticated, service_role',
    role_name
  );
  execute format(
    'alter default privileges for role %I in schema app_private revoke execute on functions from public, anon, authenticated, service_role',
    role_name
  );
end
$secure_defaults$;

-- Trigger helpers are implementation details, not application RPCs.
revoke all on function public.set_recurring_expense_anchor_day()
  from public, anon, authenticated;
revoke all on function public.set_recurring_invoice_anchor_day()
  from public, anon, authenticated;

commit;
