CREATE TABLE public.platform_settings (
  id text PRIMARY KEY DEFAULT 'default',
  recipient text NOT NULL DEFAULT '',
  iban text NOT NULL DEFAULT '',
  bic text NOT NULL DEFAULT '',
  bank text NOT NULL DEFAULT '',
  terms text NOT NULL DEFAULT '',
  vat_id text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.platform_settings TO authenticated;
GRANT ALL ON public.platform_settings TO service_role;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_read_all" ON public.platform_settings
  FOR SELECT USING (true);
CREATE POLICY "platform_settings_admin_insert" ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "platform_settings_admin_update" ON public.platform_settings
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.platform_settings (id, recipient, iban, bic, bank, terms, vat_id, email)
VALUES ('default', 'GebCalc – Rechnungssystem', '', 'SAKSDE55XXX', 'Sparkasse Saarbrücken',
        'Zahlbar innerhalb von 14 Tagen nach Rechnungserhalt, ohne Abzug.',
        'DE458492078', 'info@top4reinigung.de');