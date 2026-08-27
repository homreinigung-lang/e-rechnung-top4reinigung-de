-- 1) Narrow, column-limited public read of the platform payment row
GRANT SELECT (id, recipient, iban, bic, bank, terms, vat_id, email, address_line, postal_code, city)
  ON public.platform_settings TO anon, authenticated;

DROP POLICY IF EXISTS platform_settings_read_payment ON public.platform_settings;
CREATE POLICY platform_settings_read_payment
  ON public.platform_settings FOR SELECT
  TO anon, authenticated
  USING (id = 'default');

-- 2) Function no longer needs elevated rights
CREATE OR REPLACE FUNCTION public.get_platform_payment()
RETURNS TABLE(recipient text, iban text, bic text, bank text, terms text, address_line text, postal_code text, city text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT s.recipient, s.iban, s.bic, s.bank, s.terms, s.address_line, s.postal_code, s.city
  FROM public.platform_settings s
  WHERE s.id = 'default'
$$;

-- 3) Drop unnecessary anon execute rights on internal functions
REVOKE EXECUTE ON FUNCTION public.gen_invite_code() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.documents_block_invoice_delete() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.document_items_block_invoice_delete() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.time_entries_employee_photo_only() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.time_entries_mark_completed() FROM anon, PUBLIC;