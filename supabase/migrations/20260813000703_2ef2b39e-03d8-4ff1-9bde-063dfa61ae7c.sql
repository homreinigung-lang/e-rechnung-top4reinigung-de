-- 1) Aufbewahrungsfrist (GoBD, 10 Jahre) als abgeleitetes Feld
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS retention_until date
  GENERATED ALWAYS AS ((issue_date + interval '10 years')::date) STORED;

-- 2) Rechnungen und deren Positionen sind von jeder Löschroutine ausgenommen
CREATE OR REPLACE FUNCTION public.documents_block_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.type = 'invoice' THEN
    RAISE EXCEPTION 'Rechnungen unterliegen der 10-jährigen Aufbewahrungspflicht (GoBD) und dürfen nicht gelöscht werden. Bitte eine Stornorechnung erstellen.';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS t_documents_block_invoice_delete ON public.documents;
CREATE TRIGGER t_documents_block_invoice_delete
  BEFORE DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_block_invoice_delete();

CREATE OR REPLACE FUNCTION public.document_items_block_invoice_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE t public.doc_type;
BEGIN
  SELECT d.type INTO t FROM public.documents d WHERE d.id = OLD.document_id;
  IF t = 'invoice' THEN
    RAISE EXCEPTION 'Positionen von Rechnungen dürfen nicht gelöscht werden (GoBD).';
  END IF;
  RETURN OLD;
END; $$;

DROP TRIGGER IF EXISTS t_document_items_block_invoice_delete ON public.document_items;
CREATE TRIGGER t_document_items_block_invoice_delete
  BEFORE DELETE ON public.document_items
  FOR EACH ROW EXECUTE FUNCTION public.document_items_block_invoice_delete();

-- 3) Aufbewahrungsdauer für Arbeitsnachweis-Fotos
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS photo_retention_days integer NOT NULL DEFAULT 365;

-- 4) Täglicher Lauf für die automatische Fotolöschung
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('foto-retention-taeglich')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'foto-retention-taeglich');

SELECT cron.schedule(
  'foto-retention-taeglich',
  '20 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://e-rechnung-top4reinigung-de.lovable.app/api/public/foto-retention',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_QoeFZqSj2GBSrAYIZ7NiMw_1uy0OHf9"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);