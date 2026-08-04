ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS reminder_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_document_id uuid REFERENCES public.documents(id);

CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE probe public.documents;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Festgeschriebene Belege dürfen nicht gelöscht werden (GoBD). Bitte eine Stornorechnung erstellen.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.locked_at IS NULL THEN
    RETURN NEW;
  END IF;

  probe := NEW;
  probe.status := OLD.status;
  probe.sent_at := OLD.sent_at;
  probe.pdf_path := OLD.pdf_path;
  probe.pdf_sha256 := OLD.pdf_sha256;
  probe.archived_at := OLD.archived_at;
  probe.cancelled_by_document_id := OLD.cancelled_by_document_id;
  probe.updated_at := OLD.updated_at;
  probe.reminder_level := OLD.reminder_level;
  probe.last_reminder_at := OLD.last_reminder_at;
  probe.converted_document_id := OLD.converted_document_id;

  IF probe IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Festgeschriebene Belege sind unveränderbar (GoBD). Bitte eine Stornorechnung erstellen.';
  END IF;
  RETURN NEW;
END; $function$;