alter table public.time_entries
  add column if not exists performance_services text[] not null default '{}'::text[],
  add column if not exists performance_note text not null default '',
  add column if not exists employee_signature text not null default '',
  add column if not exists customer_signature text not null default '',
  add column if not exists customer_signer_name text not null default '',
  add column if not exists performance_status text not null default 'draft',
  add column if not exists performance_completed_at timestamptz null;

comment on column public.time_entries.performance_services is 'Ausgeführte Leistungen für den Leistungsnachweis';
comment on column public.time_entries.performance_note is 'Bemerkung zum Leistungsnachweis';
comment on column public.time_entries.employee_signature is 'Unterschrift Mitarbeiter als PNG-Data-URL';
comment on column public.time_entries.customer_signature is 'Unterschrift Kunde als PNG-Data-URL';
comment on column public.time_entries.customer_signer_name is 'Name der unterschreibenden Person beim Kunden';
comment on column public.time_entries.performance_status is 'Status des Leistungsnachweises: draft oder completed';
comment on column public.time_entries.performance_completed_at is 'Zeitpunkt der finalen Bestätigung des Leistungsnachweises';