-- SECURITY: owns_document only needs caller-visible rows.
-- Run it as the caller so the documents RLS remains in force.
begin;

alter function public.owns_document(uuid) security invoker;

revoke all on function public.owns_document(uuid) from public, anon;
grant execute on function public.owns_document(uuid) to authenticated, service_role;

commit;
