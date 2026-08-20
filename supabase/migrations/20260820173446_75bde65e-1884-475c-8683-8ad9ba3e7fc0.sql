CREATE OR REPLACE FUNCTION public.next_document_number(_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE uid uuid := auth.uid();
        y integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        v integer;
        maxv integer;
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

  -- Höchste bereits vergebene Nummer dieses Typs/Jahres ermitteln (inkl. gelöschter Belege)
  SELECT COALESCE(MAX(NULLIF(regexp_replace(d.number, '^.*-', ''), '')::int), 0)
    INTO maxv
    FROM public.documents d
   WHERE d.user_id = uid
     AND d.type = doc_type::doc_type
     AND d.number LIKE prefix || y::text || '-%'
     AND d.number ~ ('^' || prefix || y::text || '-[0-9]+$');

  INSERT INTO public.number_sequences (user_id, kind, year, last_value)
    VALUES (uid, _kind, y, GREATEST(maxv, 0) + 1)
  ON CONFLICT (user_id, kind, year)
    DO UPDATE SET last_value = GREATEST(public.number_sequences.last_value, maxv) + 1,
                  updated_at = now()
  RETURNING last_value INTO v;

  -- Sicherheitsnetz: freie Nummer suchen
  LOOP
    candidate := prefix || y::text || '-' || lpad(v::text, 4, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.documents d
       WHERE d.user_id = uid AND d.type = doc_type::doc_type AND d.number = candidate
    );
    v := v + 1;
  END LOOP;

  UPDATE public.number_sequences
     SET last_value = v, updated_at = now()
   WHERE user_id = uid AND kind = _kind AND year = y;

  RETURN candidate;
END; $function$;