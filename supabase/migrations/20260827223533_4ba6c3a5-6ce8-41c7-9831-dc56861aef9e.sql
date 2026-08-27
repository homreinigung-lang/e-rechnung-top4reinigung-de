DROP POLICY IF EXISTS platform_settings_read_payment ON public.platform_settings;

CREATE OR REPLACE FUNCTION public.get_platform_payment()
 RETURNS TABLE(recipient text, iban text, bic text, bank text, terms text, address_line text, postal_code text, city text)
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.recipient, s.iban, s.bic, s.bank, s.terms, s.address_line, s.postal_code, s.city
  FROM public.platform_settings s
  WHERE s.id = 'default'
$function$;

GRANT EXECUTE ON FUNCTION public.get_platform_payment() TO anon, authenticated;

ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS failed_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until timestamptz;