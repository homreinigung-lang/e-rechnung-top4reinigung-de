CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  old_tax_content jsonb;
  new_tax_content jsonb;
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

  -- Zahlungs-, Workflow- und Archivierungsfelder sind keine steuerlich
  -- relevanten Rechnungsinhalte und dürfen nach Festschreibung fortgeführt werden.
  old_tax_content := to_jsonb(OLD) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'retention_until', 'cancelled_by_document_id', 'updated_at',
    'reminder_level', 'last_reminder_at', 'converted_document_id'
  ];
  new_tax_content := to_jsonb(NEW) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'retention_until', 'cancelled_by_document_id', 'updated_at',
    'reminder_level', 'last_reminder_at', 'converted_document_id'
  ];

  IF new_tax_content IS DISTINCT FROM old_tax_content THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnungen sind unveränderbar (GoBD). Bitte eine Stornorechnung erstellen.';
  END IF;

  RETURN NEW;
END;
$function$;