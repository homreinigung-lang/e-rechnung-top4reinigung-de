-- Independent sales rates. Existing cost fields and documents are unchanged.
alter table public.company_settings
  add column if not exists calc_selling_hourly_min numeric(12,4),
  add column if not exists calc_selling_hourly_max numeric(12,4);

alter table public.company_settings
  add constraint company_settings_selling_hourly_range_check check (
    (calc_selling_hourly_min is null and calc_selling_hourly_max is null)
    or (
      calc_selling_hourly_min is not null and calc_selling_hourly_max is not null
      and calc_selling_hourly_min <> 'NaN'::numeric
      and calc_selling_hourly_max <> 'NaN'::numeric
      and calc_selling_hourly_min > 0
      and calc_selling_hourly_max >= calc_selling_hourly_min
    )
  );

comment on column public.company_settings.calc_selling_hourly_min is
  'Customer net selling hourly rate used as the editable initial calculation price; independent of labor costs.';
comment on column public.company_settings.calc_selling_hourly_max is
  'Upper reference of the customer net selling hourly price range; not a labor-cost field.';
