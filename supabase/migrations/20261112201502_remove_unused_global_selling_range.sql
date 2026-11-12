-- The selling price belongs to each job, not a mandatory company-wide range.
-- Abort if another user has entered data in the temporary optional fields.
do $guard$
begin
  if exists (select 1 from public.company_settings where calc_selling_hourly_min is not null or calc_selling_hourly_max is not null) then
    raise exception 'Selling-range fields contain values; review before removing them';
  end if;
end
$guard$;
alter table public.company_settings
  drop column calc_selling_hourly_min,
  drop column calc_selling_hourly_max;
