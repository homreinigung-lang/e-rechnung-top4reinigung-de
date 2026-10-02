-- SECURITY: employee accounts must be linked only through the validated invite flow.
-- The legacy email-only RPC is intentionally no longer callable by signed-in users.
begin;

revoke all on function public.link_employee_account() from public, anon, authenticated;
grant execute on function public.link_employee_account() to service_role;

commit;
