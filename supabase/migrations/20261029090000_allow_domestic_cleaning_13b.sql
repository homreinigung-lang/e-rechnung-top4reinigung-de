-- Domestic cleaning reverse charge is distinct from EU reverse charge.
-- Keep the existing Pro/Enterprise gate for EU reverse charge only.
-- This migration is source code only until reviewed and deployed separately.
CREATE OR REPLACE FUNCTION public.enforce_plan_tax_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_eu_rc boolean;
  was_eu_rc boolean;
BEGIN
  is_eu_rc := (COALESCE(NEW.tax_mode, '') = 'eu_reverse_charge')
    OR (COALESCE(NEW.reverse_charge, false) AND COALESCE(NEW.tax_mode, '') <> 'domestic_reverse_charge');
  IF TG_OP = 'UPDATE' THEN
    was_eu_rc := (COALESCE(OLD.tax_mode, '') = 'eu_reverse_charge')
      OR (COALESCE(OLD.reverse_charge, false) AND COALESCE(OLD.tax_mode, '') <> 'domestic_reverse_charge');
    IF was_eu_rc THEN
      RETURN NEW; -- Preserve existing EU reverse-charge documents.
    END IF;
  END IF;

  IF is_eu_rc AND NOT public.plan_allows_reverse_charge(NEW.user_id) THEN
    RAISE EXCEPTION 'Reverse-Charge fuer EU-Kunden ist nur in den Paketen Pro und Enterprise verfuegbar.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
