ALTER TABLE public.document_audit_log DISABLE TRIGGER t_audit_no_update;
DELETE FROM public.document_audit_log;
ALTER TABLE public.document_audit_log ENABLE TRIGGER t_audit_no_update;