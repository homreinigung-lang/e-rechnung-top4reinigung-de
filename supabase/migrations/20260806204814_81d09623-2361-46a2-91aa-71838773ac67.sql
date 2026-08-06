-- Einmalige Bereinigung der Testdaten (GoBD-Trigger kurz deaktiviert)
ALTER TABLE public.documents DISABLE TRIGGER t_documents_immutable;
ALTER TABLE public.document_items DISABLE TRIGGER t_document_items_immutable;
ALTER TABLE public.document_audit_log DISABLE TRIGGER t_audit_no_update;

DELETE FROM public.document_audit_log;
UPDATE public.documents SET cancelled_by_document_id = NULL, cancels_document_id = NULL, converted_document_id = NULL;
DELETE FROM public.document_items;
DELETE FROM public.documents;
DELETE FROM public.number_sequences;

ALTER TABLE public.documents ENABLE TRIGGER t_documents_immutable;
ALTER TABLE public.document_items ENABLE TRIGGER t_document_items_immutable;
ALTER TABLE public.document_audit_log ENABLE TRIGGER t_audit_no_update;