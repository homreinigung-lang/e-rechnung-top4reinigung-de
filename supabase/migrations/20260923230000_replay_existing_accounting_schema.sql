-- Replay existing DATEV database schema and SKR catalog on clean installations; never modify existing records.
CREATE TABLE IF NOT EXISTS public.accounting_chart_accounts (
 chart text NOT NULL CHECK (chart IN ('SKR03','SKR04')), fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
 account_number text NOT NULL CHECK (account_number ~ '^[0-9]{3,8}$'), account_name text NOT NULL, category text,
 is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (chart,fiscal_year,account_number)
);
CREATE TABLE IF NOT EXISTS public.company_accounting_settings (
 user_id uuid NOT NULL PRIMARY KEY REFERENCES public.company_settings(user_id) ON DELETE CASCADE,
 chart text NOT NULL CHECK (chart IN ('SKR03','SKR04')), fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
 datev_beraternummer text CHECK (datev_beraternummer IS NULL OR datev_beraternummer ~ '^[0-9]{1,7}$'),
 datev_mandantennummer text CHECK (datev_mandantennummer IS NULL OR datev_mandantennummer ~ '^[0-9]{1,5}$'),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.company_account_mappings (
 user_id uuid NOT NULL REFERENCES public.company_settings(user_id) ON DELETE CASCADE,
 mapping_key text NOT NULL CHECK (length(mapping_key) BETWEEN 1 AND 100),
 chart text NOT NULL CHECK (chart IN ('SKR03','SKR04')), fiscal_year integer NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2200),
 account_number text NOT NULL,
 PRIMARY KEY (user_id,mapping_key),
 CONSTRAINT company_account_mappings_chart_fiscal_year_account_number_fkey FOREIGN KEY (chart,fiscal_year,account_number)
 REFERENCES public.accounting_chart_accounts(chart,fiscal_year,account_number)
);
ALTER TABLE public.accounting_chart_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_accounting_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_account_mappings ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.accounting_chart_accounts TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.company_accounting_settings,public.company_account_mappings TO authenticated;
DO $policies$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='accounting_chart_accounts' AND policyname='read published charts') THEN
    CREATE POLICY "read published charts" ON public.accounting_chart_accounts FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_accounting_settings' AND policyname='read own accounting settings') THEN
    CREATE POLICY "read own accounting settings" ON public.company_accounting_settings FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_accounting_settings' AND policyname='insert own accounting settings') THEN
    CREATE POLICY "insert own accounting settings" ON public.company_accounting_settings FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_accounting_settings' AND policyname='update own accounting settings') THEN
    CREATE POLICY "update own accounting settings" ON public.company_accounting_settings FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_account_mappings' AND policyname='read own mappings') THEN
    CREATE POLICY "read own mappings" ON public.company_account_mappings FOR SELECT TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_account_mappings' AND policyname='insert own mappings') THEN
    CREATE POLICY "insert own mappings" ON public.company_account_mappings FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.company_accounting_settings s WHERE s.user_id=company_account_mappings.user_id AND s.chart=company_account_mappings.chart AND s.fiscal_year=company_account_mappings.fiscal_year));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_account_mappings' AND policyname='update own mappings') THEN
    CREATE POLICY "update own mappings" ON public.company_account_mappings FOR UPDATE TO authenticated USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id AND EXISTS (SELECT 1 FROM public.company_accounting_settings s WHERE s.user_id=company_account_mappings.user_id AND s.chart=company_account_mappings.chart AND s.fiscal_year=company_account_mappings.fiscal_year));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='company_account_mappings' AND policyname='delete own mappings') THEN
    CREATE POLICY "delete own mappings" ON public.company_account_mappings FOR DELETE TO authenticated USING ((select auth.uid()) = user_id);
  END IF;
END $policies$;
INSERT INTO public.accounting_chart_accounts (chart,fiscal_year,account_number,account_name,category,is_active)
VALUES
  ('SKR03', 2026, '1000', 'Kasse', 'cash', true),
  ('SKR03', 2026, '1200', 'Bank', 'bank', true),
  ('SKR03', 2026, '1400', 'Forderungen aus Lieferungen und Leistungen', 'receivables', true),
  ('SKR03', 2026, '1571', 'Abziehbare Vorsteuer 7 %', 'input_vat', true),
  ('SKR03', 2026, '1576', 'Abziehbare Vorsteuer 19 %', 'input_vat', true),
  ('SKR03', 2026, '1600', 'Verbindlichkeiten aus Lieferungen und Leistungen', 'payables', true),
  ('SKR03', 2026, '1771', 'Umsatzsteuer 7 %', 'output_vat', true),
  ('SKR03', 2026, '1776', 'Umsatzsteuer 19 %', 'output_vat', true),
  ('SKR03', 2026, '3400', 'Wareneingang 19 % Vorsteuer', 'expense', true),
  ('SKR03', 2026, '4900', 'Sonstige betriebliche Aufwendungen', 'expense', true),
  ('SKR03', 2026, '8192', 'Steuerfreie Erlöse Kleinunternehmer nach § 19 Abs. 1 UStG', 'small_business_revenue', true),
  ('SKR03', 2026, '8300', 'Erlöse 7 % USt', 'revenue', true),
  ('SKR03', 2026, '8337', 'Erlöse aus Leistungen, für die der Leistungsempfänger die Umsatzsteuer nach § 13b UStG schuldet', 'revenue_reverse_charge', true),
  ('SKR03', 2026, '8400', 'Erlöse 19 % USt', 'revenue', true),
  ('SKR04', 2026, '1200', 'Forderungen aus Lieferungen und Leistungen', 'receivables', true),
  ('SKR04', 2026, '1401', 'Abziehbare Vorsteuer 7 %', 'input_vat', true),
  ('SKR04', 2026, '1406', 'Abziehbare Vorsteuer 19 %', 'input_vat', true),
  ('SKR04', 2026, '1600', 'Kasse', 'cash', true),
  ('SKR04', 2026, '1800', 'Bank', 'bank', true),
  ('SKR04', 2026, '3300', 'Verbindlichkeiten aus Lieferungen und Leistungen', 'payables', true),
  ('SKR04', 2026, '3801', 'Umsatzsteuer 7 %', 'output_vat', true),
  ('SKR04', 2026, '3806', 'Umsatzsteuer 19 %', 'output_vat', true),
  ('SKR04', 2026, '4192', 'Steuerfreie Erlöse Kleinunternehmer nach § 19 Abs. 1 UStG', 'small_business_revenue', true),
  ('SKR04', 2026, '4300', 'Erlöse 7 % USt', 'revenue', true),
  ('SKR04', 2026, '4337', 'Erlöse aus Leistungen, für die der Leistungsempfänger die Umsatzsteuer nach § 13b UStG schuldet', 'revenue_reverse_charge', true),
  ('SKR04', 2026, '4400', 'Erlöse 19 % USt', 'revenue', true),
  ('SKR04', 2026, '5400', 'Wareneingang 19 % Vorsteuer', 'expense', true),
  ('SKR04', 2026, '6300', 'Sonstige betriebliche Aufwendungen', 'expense', true)
ON CONFLICT (chart,fiscal_year,account_number) DO NOTHING;
