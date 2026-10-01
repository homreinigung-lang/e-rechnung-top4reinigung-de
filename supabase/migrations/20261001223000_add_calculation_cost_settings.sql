-- Konfigurierbare Kostenbasis für die Angebots-/Objektkalkulation.
-- Werte sind interne Standardwerte pro Mandant und können in Einstellungen geändert werden.
alter table public.company_settings
  add column if not exists calc_worker_hourly_wage numeric(10,2) not null default 15.00,
  add column if not exists calc_labor_burden_percent numeric(7,2) not null default 32.00,
  add column if not exists calc_material_cost_hour numeric(10,2) not null default 1.20,
  add column if not exists calc_overhead_cost_hour numeric(10,2) not null default 3.50,
  add column if not exists calc_profit_markup_percent numeric(7,2) not null default 20.00;

alter table public.company_settings
  drop constraint if exists company_settings_calc_worker_hourly_wage_nonnegative,
  add constraint company_settings_calc_worker_hourly_wage_nonnegative
    check (calc_worker_hourly_wage >= 0),
  drop constraint if exists company_settings_calc_labor_burden_percent_range,
  add constraint company_settings_calc_labor_burden_percent_range
    check (calc_labor_burden_percent >= 0 and calc_labor_burden_percent <= 200),
  drop constraint if exists company_settings_calc_material_cost_hour_nonnegative,
  add constraint company_settings_calc_material_cost_hour_nonnegative
    check (calc_material_cost_hour >= 0),
  drop constraint if exists company_settings_calc_overhead_cost_hour_nonnegative,
  add constraint company_settings_calc_overhead_cost_hour_nonnegative
    check (calc_overhead_cost_hour >= 0),
  drop constraint if exists company_settings_calc_profit_markup_percent_range,
  add constraint company_settings_calc_profit_markup_percent_range
    check (calc_profit_markup_percent >= 0 and calc_profit_markup_percent <= 100);
