insert into public.accounting_chart_accounts (chart,fiscal_year,account_number,account_name,category,is_active)
values
('SKR03',2026,'4110','Löhne','expense',true),
('SKR03',2026,'4250','Reinigung / Reinigungsmittel','expense',true),
('SKR03',2026,'4360','Versicherungen','expense',true),
('SKR04',2026,'6010','Löhne','expense',true),
('SKR04',2026,'6330','Reinigung / Reinigungsmittel','expense',true),
('SKR04',2026,'6400','Versicherungen','expense',true)
on conflict (chart,fiscal_year,account_number) do nothing;
