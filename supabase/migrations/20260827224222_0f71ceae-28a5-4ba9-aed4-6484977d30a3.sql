-- 1) Funktion ohne erhöhte Rechte (kein SECURITY DEFINER mehr)
CREATE OR REPLACE FUNCTION public.get_platform_payment()
 RETURNS TABLE(recipient text, iban text, bic text, bank text, terms text, address_line text, postal_code text, city text)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT s.recipient, s.iban, s.bic, s.bank, s.terms, s.address_line, s.postal_code, s.city
  FROM public.platform_settings s
  WHERE s.id = 'default'
$function$;

-- 2) Öffentliche Leseberechtigung nur auf die Zahlungsspalten des Standard-Eintrags
REVOKE ALL ON public.platform_settings FROM anon;
GRANT SELECT (id, recipient, iban, bic, bank, terms, address_line, postal_code, city)
  ON public.platform_settings TO anon;

DROP POLICY IF EXISTS platform_settings_public_payment ON public.platform_settings;
CREATE POLICY platform_settings_public_payment
  ON public.platform_settings
  FOR SELECT
  TO anon
  USING (id = 'default');