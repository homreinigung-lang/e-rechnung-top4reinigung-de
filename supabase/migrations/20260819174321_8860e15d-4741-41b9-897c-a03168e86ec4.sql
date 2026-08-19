ALTER TYPE public.doc_type ADD VALUE IF NOT EXISTS 'order';

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
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  INSERT INTO public.number_sequences (user_id, kind, year, last_value)
    VALUES (uid, _kind, y, 1)
  ON CONFLICT (user_id, kind, year)
    DO UPDATE SET last_value = public.number_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v;
  prefix := CASE
              WHEN _kind = 'invoice' THEN 'RE-'
              WHEN _kind = 'storno' THEN 'ST-'
              WHEN _kind = 'order' THEN 'AB-'
              ELSE 'AN-' END;
  RETURN prefix || y::text || '-' || lpad(v::text, 4, '0');
END; $function$;