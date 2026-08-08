ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS personnel_number text NOT NULL DEFAULT '';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS customer_number text NOT NULL DEFAULT '';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS customer_number text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.next_customer_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE uid uuid := auth.uid();
        y integer := EXTRACT(YEAR FROM CURRENT_DATE)::int;
        v integer;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  INSERT INTO public.number_sequences (user_id, kind, year, last_value)
    VALUES (uid, 'customer', y, 1)
  ON CONFLICT (user_id, kind, year)
    DO UPDATE SET last_value = public.number_sequences.last_value + 1, updated_at = now()
  RETURNING last_value INTO v;
  RETURN 'KU-' || y::text || '-' || lpad(v::text, 4, '0');
END; $$;

REVOKE ALL ON FUNCTION public.next_customer_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_customer_number() TO authenticated;

-- Bestehende Kunden erhalten fortlaufende Nummern je Inhaber
WITH numbered AS (
  SELECT id, user_id,
         row_number() OVER (PARTITION BY user_id ORDER BY created_at) AS rn,
         EXTRACT(YEAR FROM created_at)::int AS y
    FROM public.customers
   WHERE customer_number = ''
)
UPDATE public.customers c
   SET customer_number = 'KU-' || n.y::text || '-' || lpad(n.rn::text, 4, '0')
  FROM numbered n
 WHERE c.id = n.id;

INSERT INTO public.number_sequences (user_id, kind, year, last_value)
SELECT user_id, 'customer', EXTRACT(YEAR FROM CURRENT_DATE)::int, count(*)
  FROM public.customers
 GROUP BY user_id
ON CONFLICT (user_id, kind, year) DO UPDATE SET last_value = EXCLUDED.last_value;