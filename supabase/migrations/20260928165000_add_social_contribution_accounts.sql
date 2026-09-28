
insert into public.accounting_chart_accounts
  (chart,fiscal_year,account_number,account_name,category,is_active)
values
  ('SKR03',2026,'4130','Gesetzliche soziale Aufwendungen','expense',true),
  ('SKR04',2026,'6110','Gesetzliche soziale Aufwendungen','expense',true)
on conflict (chart,fiscal_year,account_number) do update
set account_name = excluded.account_name,
    category = excluded.category,
    is_active = true;
