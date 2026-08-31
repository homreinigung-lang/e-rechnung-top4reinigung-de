REVOKE ALL ON FUNCTION public.create_storno(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.create_storno(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_storno(uuid, text) TO service_role;