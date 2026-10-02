-- SECURITY: new objects in exposed schemas must be private by default.
-- Explicit GRANT statements in each migration opt objects into Data API access.
begin;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete, truncate, references, trigger
  on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select, update on sequences from anon, authenticated, service_role;

-- supabase_admin exists on hosted Supabase, but not in the disposable CI database.
do $supabase_admin_defaults$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    execute 'alter default privileges for role supabase_admin in schema public revoke select, insert, update, delete, truncate, references, trigger on tables from anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema public revoke execute on functions from public, anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema public revoke usage, select, update on sequences from anon, authenticated, service_role';
    execute 'alter default privileges for role supabase_admin in schema app_private revoke execute on functions from public, anon, authenticated, service_role';
  end if;
end
$supabase_admin_defaults$;

-- Internal helpers should never become generally executable by default.
alter default privileges for role postgres in schema app_private
  revoke execute on functions from public, anon, authenticated, service_role;

-- Trigger helpers are not application RPCs.
revoke all on function public.set_recurring_expense_anchor_day()
  from public, anon, authenticated;
revoke all on function public.set_recurring_invoice_anchor_day()
  from public, anon, authenticated;

commit;
