-- Complete the existing 2026 SKR account catalog for the app's eu_reverse_charge invoices.
-- Non-destructive: existing account descriptions and mappings remain unchanged.
insert into public.accounting_chart_accounts (chart, fiscal_year, account_number, account_name, category, is_active)
values
  ('SKR03', 2026, '8336', 'Erlöse aus im anderen EU-Land steuerpflichtigen sonstigen Leistungen, für die der Leistungsempfänger die Umsatzsteuer schuldet', 'revenue_eu_reverse_charge', true),
  ('SKR04', 2026, '4336', 'Erlöse aus im anderen EU-Land steuerpflichtigen sonstigen Leistungen, für die der Leistungsempfänger die Umsatzsteuer schuldet', 'revenue_eu_reverse_charge', true)
on conflict (chart, fiscal_year, account_number) do nothing;
