-- Domestic cleaning reverse charge is distinct from EU reverse charge.
-- Keep the existing Pro/Enterprise gate for EU reverse charge only.
-- This migration is source code only until reviewed and deployed separately.
-- Some production databases never received the original plan gate. Install its
-- dependency and trigger explicitly so both upgrade paths converge safely.
CREATE OR REPLACE FUNCTION public.plan_allows_reverse_charge(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND lower(s.plan) IN ('pro', 'enterprise')
  );
$$;
REVOKE EXECUTE ON FUNCTION public.plan_allows_reverse_charge(uuid) FROM anon, authenticated, public;

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

REVOKE EXECUTE ON FUNCTION public.enforce_plan_tax_mode() FROM anon, authenticated, public;
DROP TRIGGER IF EXISTS trg_documents_plan_tax_mode ON public.documents;
CREATE TRIGGER trg_documents_plan_tax_mode
BEFORE INSERT OR UPDATE OF tax_mode, reverse_charge ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_tax_mode();
