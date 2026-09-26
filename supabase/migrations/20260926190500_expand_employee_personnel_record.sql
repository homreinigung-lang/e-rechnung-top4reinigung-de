alter table public.employees
  add column if not exists birth_date date,
  add column if not exists address_line text not null default '',
  add column if not exists postal_code text not null default '',
  add column if not exists city text not null default '',
  add column if not exists contract_end date,
  add column if not exists has_driving_license boolean not null default false,
  add column if not exists driving_license_classes text not null default '',
  add column if not exists qualification text not null default '',
  add column if not exists has_experience_certificate boolean not null default false,
  add column if not exists experience_details text not null default '',
  add column if not exists personnel_notes text not null default '';

comment on column public.employees.qualification is
  'Ausbildung, Berufsabschluss, Schulung oder sonstige relevante Qualifikation.';
comment on column public.employees.experience_details is
  'Angaben zu Arbeitszeugnis, Berufserfahrung oder vergleichbaren Nachweisen.';
