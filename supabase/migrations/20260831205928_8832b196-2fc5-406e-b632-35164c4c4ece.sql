CREATE OR REPLACE FUNCTION public.plan_allows_reverse_charge(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = _user_id
      AND lower(s.plan) IN ('pro', 'enterprise')
  );
$$;

REVOKE EXECUTE ON FUNCTION public.plan_allows_reverse_charge(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.plan_allows_reverse_charge(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enforce_plan_tax_mode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_rc boolean;
  was_rc boolean;
BEGIN
  is_rc := (COALESCE(NEW.tax_mode, '') = 'eu_reverse_charge') OR COALESCE(NEW.reverse_charge, false);

  IF TG_OP = 'UPDATE' THEN
    was_rc := (COALESCE(OLD.tax_mode, '') = 'eu_reverse_charge') OR COALESCE(OLD.reverse_charge, false);
    IF was_rc THEN
      RETURN NEW; -- Bestandsbelege bleiben unveraendert (GoBD)
    END IF;
  END IF;

  IF is_rc AND NOT public.plan_allows_reverse_charge(NEW.user_id) THEN
    RAISE EXCEPTION 'Reverse-Charge (0 %% MwSt. fuer EU-Kunden) ist nur in den Paketen Pro und Enterprise verfuegbar. Bitte wechseln Sie Ihr Paket oder waehlen Sie eine andere Steuerart.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_plan_tax_mode ON public.documents;
CREATE TRIGGER trg_documents_plan_tax_mode
BEFORE INSERT OR UPDATE OF tax_mode, reverse_charge ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_tax_mode();