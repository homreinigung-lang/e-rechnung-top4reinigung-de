
alter table public.company_holidays
  add column if not exists surcharge_percent numeric(7,2) not null default 80
    check (surcharge_percent >= 0 and surcharge_percent <= 500);

-- Tarifwerte Gebäudereinigung (RTV 31.10.2019) nur dort vorbelegen,
-- wo noch keine individuelle Firmenregel gesetzt wurde.
update public.wage_types
set surcharge_percent = 30,
    time_from = coalesce(time_from, '22:00'::time),
    time_to = coalesce(time_to, '05:00'::time),
    updated_at = now()
where kind = 'night' and surcharge_percent = 0;

update public.wage_types
set surcharge_percent = 80,
    updated_at = now()
where kind = 'sunday' and surcharge_percent = 0;

update public.wage_types
set surcharge_percent = 80,
    updated_at = now()
where kind = 'holiday' and surcharge_percent = 0;

update public.wage_types
set name = 'Belastungszuschlag',
    code = case when code = 'UEBERSTUNDEN' then 'BELASTUNG' else code end,
    surcharge_percent = 25,
    updated_at = now()
where kind = 'overtime' and surcharge_percent = 0;

comment on column public.company_holidays.surcharge_percent is
  'Zuschlagssatz dieses Feiertags. Standard 80 %, besondere Feiertage können z. B. 200 % erhalten.';
