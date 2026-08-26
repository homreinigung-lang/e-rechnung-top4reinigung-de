DROP POLICY IF EXISTS platform_settings_read_authenticated ON public.platform_settings;

CREATE POLICY platform_settings_read_admin
  ON public.platform_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.get_platform_payment()
RETURNS TABLE (
  recipient text,
  iban text,
  bic text,
  bank text,
  terms text,
  address_line text,
  postal_code text,
  city text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.recipient, s.iban, s.bic, s.bank, s.terms,
         s.address_line, s.postal_code, s.city
    FROM public.platform_settings s
   WHERE s.id = 'default'
     AND auth.uid() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_platform_payment() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_platform_payment() TO authenticated;