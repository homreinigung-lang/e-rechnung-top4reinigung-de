CREATE OR REPLACE FUNCTION public.documents_block_invoice_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
BEGIN
  IF OLD.type = 'invoice' AND OLD.locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Rechnungen unterliegen nach dem Versand der 10-jährigen Aufbewahrungspflicht (GoBD) und dürfen nicht gelöscht werden. Bitte eine Stornorechnung erstellen.';
  END IF;
  RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.document_items_block_invoice_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE t public.doc_type; l timestamptz;
BEGIN
  SELECT d.type, d.locked_at INTO t, l FROM public.documents d WHERE d.id = OLD.document_id;
  IF t = 'invoice' AND l IS NOT NULL THEN
    RAISE EXCEPTION 'Positionen versendeter Rechnungen dürfen nicht gelöscht werden (GoBD).';
  END IF;
  RETURN OLD;
END; $function$;

CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE probe public.documents;
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
  probe.paid_at := OLD.paid_at;

  IF probe IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnungen sind unveränderbar (GoBD). Bitte eine Stornorechnung erstellen.';
  END IF;
  RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.document_items_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE locked timestamptz; t public.doc_type;
BEGIN
  SELECT d.locked_at, d.type INTO locked, t FROM public.documents d
    WHERE d.id = COALESCE(NEW.document_id, OLD.document_id);
  IF t = 'invoice' AND locked IS NOT NULL THEN
    RAISE EXCEPTION 'Positionen festgeschriebener Rechnungen sind unveränderbar (GoBD).';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $function$;