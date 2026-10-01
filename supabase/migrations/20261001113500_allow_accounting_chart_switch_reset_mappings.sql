-- Allow switching between SKR03 and SKR04 (or fiscal year) safely.
-- Existing account mappings belong to the old chart/year and are therefore
-- removed atomically before the accounting settings row is updated.
-- The application then recreates the appropriate mappings for the new chart.

create or replace function public.guard_company_accounting_chart_change()
returns trigger
language plpgsql
as $$
begin
  if old.chart is distinct from new.chart
     or old.fiscal_year is distinct from new.fiscal_year then
    delete from public.company_account_mappings
    where user_id = new.user_id;
  end if;

  return new;
end;
$$;
