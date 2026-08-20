REVOKE EXECUTE ON FUNCTION public.owns_document(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.owns_document(uuid) TO authenticated, service_role;