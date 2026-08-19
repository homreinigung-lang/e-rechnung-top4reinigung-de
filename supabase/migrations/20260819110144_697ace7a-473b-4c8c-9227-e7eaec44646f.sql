ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_documents_deleted_at ON public.documents (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customers_deleted_at ON public.customers (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_expenses_deleted_at ON public.expenses (user_id, deleted_at);

-- Gelöschte Einträge aus allen normalen Abfragen ausblenden
DROP POLICY IF EXISTS "own documents" ON public.documents;
CREATE POLICY "documents select own" ON public.documents FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "documents insert own" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents update own" ON public.documents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "documents delete own" ON public.documents FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own customers" ON public.customers;
CREATE POLICY "customers select own" ON public.customers FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "customers insert own" ON public.customers FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers update own" ON public.customers FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "customers delete own" ON public.customers FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "own expenses" ON public.expenses;
CREATE POLICY "expenses select own" ON public.expenses FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND deleted_at IS NULL);
CREATE POLICY "expenses insert own" ON public.expenses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses update own" ON public.expenses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "expenses delete own" ON public.expenses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Immutabilitäts-Trigger: deleted_at ist kein steuerlicher Rechnungsinhalt
CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
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

  old_tax_content := to_jsonb(OLD) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'retention_until', 'cancelled_by_document_id', 'updated_at',
    'reminder_level', 'last_reminder_at', 'converted_document_id', 'deleted_at'
  ];
  new_tax_content := to_jsonb(NEW) - ARRAY[
    'status', 'paid_at', 'sent_at', 'pdf_path', 'pdf_sha256', 'archived_at',
    'retention_until', 'cancelled_by_document_id', 'updated_at',
    'reminder_level', 'last_reminder_at', 'converted_document_id', 'deleted_at'
  ];

  IF new_tax_content IS DISTINCT FROM old_tax_content THEN
    RAISE EXCEPTION 'Festgeschriebene Rechnungen sind unveränderbar (GoBD). Bitte eine Stornorechnung erstellen.';
  END IF;

  RETURN NEW;
END; $function$;

-- In den Papierkorb legen
CREATE OR REPLACE FUNCTION public.trash_entity(_entity text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); n integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF _entity = 'document' THEN
    IF EXISTS (SELECT 1 FROM public.documents WHERE id = _id AND user_id = uid
               AND type = 'invoice' AND locked_at IS NOT NULL) THEN
      RAISE EXCEPTION 'Festgeschriebene Rechnungen dürfen nicht gelöscht werden (GoBD). Bitte eine Stornorechnung erstellen.';
    END IF;
    UPDATE public.documents SET deleted_at = now() WHERE id = _id AND user_id = uid AND deleted_at IS NULL;
  ELSIF _entity = 'customer' THEN
    UPDATE public.customers SET deleted_at = now() WHERE id = _id AND user_id = uid AND deleted_at IS NULL;
  ELSIF _entity = 'expense' THEN
    UPDATE public.expenses SET deleted_at = now() WHERE id = _id AND user_id = uid AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unbekannter Datentyp: %', _entity;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Eintrag nicht gefunden'; END IF;
END; $$;

-- Papierkorb auflisten
CREATE OR REPLACE FUNCTION public.list_trash()
RETURNS TABLE (entity text, id uuid, label text, info text, deleted_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT 'document', d.id,
         CASE WHEN d.type = 'invoice' THEN 'Rechnung ' ELSE 'Angebot ' END || d.number,
         COALESCE(NULLIF(d.customer_company, ''), d.customer_name), d.deleted_at
    FROM public.documents d WHERE d.user_id = auth.uid() AND d.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'customer', c.id, COALESCE(NULLIF(c.company, ''), c.name), c.customer_number, c.deleted_at
    FROM public.customers c WHERE c.user_id = auth.uid() AND c.deleted_at IS NOT NULL
  UNION ALL
  SELECT 'expense', e.id, e.supplier, e.document_number, e.deleted_at
    FROM public.expenses e WHERE e.user_id = auth.uid() AND e.deleted_at IS NOT NULL
  ORDER BY 5 DESC;
$$;

-- Wiederherstellen
CREATE OR REPLACE FUNCTION public.restore_entity(_entity text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF _entity = 'document' THEN
    UPDATE public.documents SET deleted_at = NULL WHERE id = _id AND user_id = uid;
  ELSIF _entity = 'customer' THEN
    UPDATE public.customers SET deleted_at = NULL WHERE id = _id AND user_id = uid;
  ELSIF _entity = 'expense' THEN
    UPDATE public.expenses SET deleted_at = NULL WHERE id = _id AND user_id = uid;
  ELSE
    RAISE EXCEPTION 'Unbekannter Datentyp: %', _entity;
  END IF;
END; $$;

-- Endgültig löschen
CREATE OR REPLACE FUNCTION public.purge_entity(_entity text, _id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  IF _entity = 'document' THEN
    DELETE FROM public.document_items WHERE document_id = _id AND user_id = uid;
    DELETE FROM public.documents WHERE id = _id AND user_id = uid AND deleted_at IS NOT NULL;
  ELSIF _entity = 'customer' THEN
    DELETE FROM public.customers WHERE id = _id AND user_id = uid AND deleted_at IS NOT NULL;
  ELSIF _entity = 'expense' THEN
    DELETE FROM public.expenses WHERE id = _id AND user_id = uid AND deleted_at IS NOT NULL;
  ELSE
    RAISE EXCEPTION 'Unbekannter Datentyp: %', _entity;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.trash_entity(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_entity(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_entity(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_trash() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.trash_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.purge_entity(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_trash() TO authenticated;

-- Automatische endgültige Löschung nach 30 Tagen
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule('papierkorb-purge') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'papierkorb-purge');
SELECT cron.schedule('papierkorb-purge', '40 3 * * *', $$
  DELETE FROM public.document_items i USING public.documents d
    WHERE i.document_id = d.id AND d.deleted_at < now() - interval '30 days';
  DELETE FROM public.documents WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.customers WHERE deleted_at < now() - interval '30 days';
  DELETE FROM public.expenses WHERE deleted_at < now() - interval '30 days';
$$);