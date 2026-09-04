-- Öffentliche Abo-Anzeige: nur Firmenname und Ort
REVOKE SELECT ON public.subscriptions FROM anon;
GRANT SELECT (id, company_name, city, status, visible_on_landing, sort_order) ON public.subscriptions TO anon;

-- Plattform-Zahlungsdaten: nur überweisungsrelevante Felder öffentlich
REVOKE SELECT ON public.platform_settings FROM anon;
GRANT SELECT (id, recipient, iban, bic, bank, terms, address_line, postal_code, city) ON public.platform_settings TO anon;

-- Bestellungen: Preis und Status serverseitig festlegen
CREATE OR REPLACE FUNCTION public.plan_orders_enforce_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p public.plans; net integer; vat integer;
BEGIN
  NEW.status := 'new';
  IF NEW.plan_id IS NOT NULL THEN
    SELECT * INTO p FROM public.plans WHERE id = NEW.plan_id AND active;
  END IF;
  IF NOT FOUND OR p.id IS NULL THEN
    SELECT * INTO p FROM public.plans WHERE code = NEW.plan_code AND active;
  END IF;
  IF p.id IS NOT NULL THEN
    NEW.plan_id := p.id;
    NEW.plan_code := p.code;
    NEW.plan_name := p.name;
    net := CASE WHEN NEW.billing_interval = 'yearly' THEN p.price_yearly_cents ELSE p.price_monthly_cents END;
    vat := CASE WHEN COALESCE(NEW.reverse_charge, false) THEN 0 ELSE round(net * 0.19) END;
    NEW.net_cents := net;
    NEW.vat_cents := vat;
    NEW.gross_cents := net + vat;
  END IF;
  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.plan_orders_enforce_price() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_plan_orders_price ON public.plan_orders;
CREATE TRIGGER t_plan_orders_price
  BEFORE INSERT ON public.plan_orders
  FOR EACH ROW EXECUTE FUNCTION public.plan_orders_enforce_price();