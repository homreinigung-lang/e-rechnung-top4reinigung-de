CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  old_tax_content jsonb;
  new_tax_content jsonb;
  changed_fields text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.type = 'invoice' AND OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Festgeschriebene Rechnungen dürfen nicht gelöscht werden (GoBD). Bitte eine Stornorechnung erstellen.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.type <> 'invoice' OR OLD.locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  old_tax_content := to_jsonb(OLD) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'cancelled_by_document_id', 'updated_at', 'reminder_level',
    'last_reminder_at', 'converted_document_id'
  ];
  new_tax_content := to_jsonb(NEW) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'cancelled_by_document_id', 'updated_at', 'reminder_level',
    'last_reminder_at', 'converted_document_id'
  ];

  IF new_tax_content IS DISTINCT FROM old_tax_content THEN
    SELECT string_agg(key, ', ' ORDER BY key)
      INTO changed_fields
      FROM (
        SELECT key
        FROM jsonb_object_keys(old_tax_content || new_tax_content) AS key
        WHERE old_tax_content -> key IS DISTINCT FROM new_tax_content -> key
      ) changed;
    RAISE EXCEPTION 'Festgeschriebene Rechnungen sind unveränderbar (GoBD). Geänderte Felder: %', COALESCE(changed_fields, 'unbekannt');
  END IF;

  RETURN NEW;
END;
$function$;