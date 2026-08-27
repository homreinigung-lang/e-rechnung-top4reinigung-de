-- 1) Bestehende Nummernlücke schließen (RE-2026-0005 -> RE-2026-0002)
ALTER TABLE public.documents DISABLE TRIGGER t_documents_immutable;
UPDATE public.documents SET number = 'RE-2026-0002'
 WHERE number = 'RE-2026-0005' AND type = 'invoice';
ALTER TABLE public.documents ENABLE TRIGGER t_documents_immutable;

INSERT INTO public.document_audit_log (user_id, document_id, document_number, action, details)
SELECT d.user_id, d.id, d.number, 'number_corrected',
       jsonb_build_object('previous_number', 'RE-2026-0005', 'reason', 'Lückenlose Nummernfolge gemäß GoBD')
  FROM public.documents d WHERE d.number = 'RE-2026-0002' AND d.type = 'invoice';

-- 2) Nummernvergabe strikt auf MAX(nummer) + 1 umstellen
CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
        y integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        v integer;
        prefix text;
        candidate text;
        doc_type text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;

  prefix := CASE
              WHEN _kind = 'invoice' THEN 'RE-'
              WHEN _kind = 'storno' THEN 'ST-'
              WHEN _kind = 'order' THEN 'AB-'
              ELSE 'AN-' END;

  doc_type := CASE
                WHEN _kind = 'invoice' OR _kind = 'storno' THEN 'invoice'
                WHEN _kind = 'order' THEN 'order'
                ELSE 'quote' END;

  -- Höchste tatsächlich vorhandene (nicht gelöschte) Nummer des Jahres + 1
  SELECT COALESCE(MAX(NULLIF(regexp_replace(d.number, '^.*-', ''), '')::int), 0) + 1
    INTO v
    FROM public.documents d
   WHERE d.user_id = uid
     AND d.type = doc_type::doc_type
     AND d.deleted_at IS NULL
     AND d.number ~ ('^' || prefix || y::text || '-[0-9]+$');

  -- Kollisionen (z. B. mit Belegen im Papierkorb) überspringen
  LOOP
    candidate := prefix || y::text || '-' || lpad(v::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.documents d
       WHERE d.user_id = uid AND d.type = doc_type::doc_type AND d.number = candidate
    );
    v := v + 1;
  END LOOP;

  INSERT INTO public.number_sequences (user_id, kind, year, last_value)
    VALUES (uid, _kind, y, v)
  ON CONFLICT (user_id, kind, year)
    DO UPDATE SET last_value = v, updated_at = now();

  RETURN candidate;
END; $function$;

-- 3) Zähler auf den tatsächlichen Stand zurücksetzen
UPDATE public.number_sequences ns
   SET last_value = COALESCE((
         SELECT MAX(NULLIF(regexp_replace(d.number, '^.*-', ''), '')::int)
           FROM public.documents d
          WHERE d.user_id = ns.user_id
            AND d.deleted_at IS NULL
            AND d.number ~ ('^(RE|AN|AB|ST)-' || ns.year::text || '-[0-9]+$')
            AND d.type = (CASE WHEN ns.kind IN ('invoice','storno') THEN 'invoice'
                               WHEN ns.kind = 'order' THEN 'order' ELSE 'quote' END)::doc_type
       ), 0),
       updated_at = now();