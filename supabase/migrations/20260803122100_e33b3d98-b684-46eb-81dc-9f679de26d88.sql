REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_document(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_storno(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_storno(uuid) TO authenticated;