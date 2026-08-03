-- 1. Documents: GoBD columns
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancels_document_id uuid REFERENCES public.documents(id),
  ADD COLUMN IF NOT EXISTS cancelled_by_document_id uuid REFERENCES public.documents(id),
  ADD COLUMN IF NOT EXISTS is_storno boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_path text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pdf_sha256 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Gapless number sequences
CREATE TABLE IF NOT EXISTS public.number_sequences (
  user_id uuid NOT NULL,
  kind text NOT NULL,
  year integer NOT NULL,
  last_value integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, year)
);
GRANT SELECT ON public.number_sequences TO authenticated;
GRANT ALL ON public.number_sequences TO service_role;
ALTER TABLE public.number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sequences" ON public.number_sequences FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. Immutable audit log
CREATE TABLE IF NOT EXISTS public.document_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid,
  document_number text NOT NULL DEFAULT '',
  action text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.document_audit_log TO authenticated;
GRANT ALL ON public.document_audit_log TO service_role;
ALTER TABLE public.document_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own audit read" ON public.document_audit_log FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own audit insert" ON public.document_audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'Das Prüfprotokoll ist unveränderbar (GoBD).';
END; $$;
DROP TRIGGER IF EXISTS t_audit_no_update ON public.document_audit_log;
CREATE TRIGGER t_audit_no_update BEFORE UPDATE OR DELETE ON public.document_audit_log
FOR EACH ROW EXECUTE FUNCTION public.audit_log_immutable();

-- 4. Immutability of finalized documents
CREATE OR REPLACE FUNCTION public.documents_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

  -- Only these fields may change after finalization.
  probe := NEW;
  probe.status := OLD.status;
  probe.sent_at := OLD.sent_at;
  probe.pdf_path := OLD.pdf_path;
  probe.pdf_sha256 := OLD.pdf_sha256;
  probe.archived_at := OLD.archived_at;
  probe.cancelled_by_document_id := OLD.cancelled_by_document_id;
  probe.updated_at := OLD.updated_at;

  IF probe IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Festgeschriebene Belege sind unveränderbar (GoBD). Bitte eine Stornorechnung erstellen.';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS t_documents_immutable ON public.documents;
CREATE TRIGGER t_documents_immutable BEFORE UPDATE OR DELETE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.documents_enforce_immutability();

CREATE OR REPLACE FUNCTION public.document_items_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE locked timestamptz;
BEGIN
  SELECT d.locked_at INTO locked FROM public.documents d
    WHERE d.id = COALESCE(NEW.document_id, OLD.document_id);
  IF locked IS NOT NULL THEN
    RAISE EXCEPTION 'Positionen festgeschriebener Belege sind unveränderbar (GoBD).';
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
DROP TRIGGER IF EXISTS t_document_items_immutable ON public.document_items;
CREATE TRIGGER t_document_items_immutable BEFORE INSERT OR UPDATE OR DELETE ON public.document_items
FOR EACH ROW EXECUTE FUNCTION public.document_items_enforce_immutability();

-- 5. Gapless numbering
CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
        y integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        v integer;
        prefix text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  INSERT INTO public.number_sequences (user_id, kind, year, last_value)
    VALUES (uid, _kind, y, 1)
  ON CONFLICT (user_id, kind, year)
    DO UPDATE SET last_value = public.number_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v;
  prefix := CASE WHEN _kind = 'invoice' THEN 'RE-' WHEN _kind = 'storno' THEN 'ST-' ELSE 'AN-' END;
  RETURN prefix || y::text || '-' || lpad(v::text, 4, '0');
END; $$;
GRANT EXECUTE ON FUNCTION public.next_document_number(text) TO authenticated;

-- 6. Finalize (festschreiben)
CREATE OR REPLACE FUNCTION public.finalize_document(_id uuid)
RETURNS public.documents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d public.documents; n text;
BEGIN
  SELECT * INTO d FROM public.documents WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Beleg nicht gefunden'; END IF;
  IF d.locked_at IS NOT NULL THEN RETURN d; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.document_items WHERE document_id = _id) THEN
    RAISE EXCEPTION 'Beleg ohne Positionen kann nicht festgeschrieben werden.';
  END IF;

  n := public.next_document_number(d.type::text);
  UPDATE public.documents
     SET number = n,
         locked_at = now(),
         status = CASE WHEN status = 'draft' THEN 'sent'::doc_status ELSE status END
   WHERE id = _id
  RETURNING * INTO d;

  INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details)
  VALUES (d.user_id, d.id, d.number, 'finalized',
          jsonb_build_object('total', d.total, 'net_total', d.net_total, 'vat_amount', d.vat_amount,
                             'issue_date', d.issue_date, 'previous_number', _id));
  RETURN d;
END; $$;
GRANT EXECUTE ON FUNCTION public.finalize_document(uuid) TO authenticated;

-- 7. Storno
CREATE OR REPLACE FUNCTION public.create_storno(_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src public.documents; new_id uuid; n text;
BEGIN
  SELECT * INTO src FROM public.documents WHERE id = _id AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Beleg nicht gefunden'; END IF;
  IF src.type <> 'invoice' THEN RAISE EXCEPTION 'Nur Rechnungen können storniert werden.'; END IF;
  IF src.cancelled_by_document_id IS NOT NULL THEN RAISE EXCEPTION 'Diese Rechnung wurde bereits storniert.'; END IF;

  n := public.next_document_number('invoice');

  INSERT INTO public.documents (
    user_id, type, number, status, issue_date, due_date, customer_id, customer_name,
    customer_company, customer_email, customer_address_line, customer_postal_code, customer_city,
    customer_country, customer_vat_id, reverse_charge, intro_text, notes, order_number, tax_mode,
    vat_rate, service_period, net_total, vat_amount, total, is_storno, cancels_document_id, locked_at
  ) VALUES (
    src.user_id, 'invoice', n, 'sent', CURRENT_DATE, NULL, src.customer_id, src.customer_name,
    src.customer_company, src.customer_email, src.customer_address_line, src.customer_postal_code,
    src.customer_city, src.customer_country, src.customer_vat_id, src.reverse_charge,
    'Stornorechnung zur Rechnung ' || src.number || ' vom ' || to_char(src.issue_date, 'DD.MM.YYYY') ||
    '. Die ursprüngliche Rechnung wird hiermit vollständig storniert.',
    src.notes, src.order_number, src.tax_mode, src.vat_rate, src.service_period,
    -src.net_total, -src.vat_amount, -src.total, true, src.id, now()
  ) RETURNING id INTO new_id;

  INSERT INTO public.document_items (document_id, user_id, position, description, quantity, unit, unit_price)
  SELECT new_id, src.user_id, position, description, quantity, unit, -unit_price
    FROM public.document_items WHERE document_id = src.id ORDER BY position;

  UPDATE public.documents SET cancelled_by_document_id = new_id, status = 'cancelled' WHERE id = src.id;

  INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details)
  VALUES (src.user_id, new_id, n, 'storno_created', jsonb_build_object('cancels', src.number, 'total', -src.total)),
         (src.user_id, src.id, src.number, 'cancelled', jsonb_build_object('storno_number', n));

  RETURN new_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.create_storno(uuid) TO authenticated;