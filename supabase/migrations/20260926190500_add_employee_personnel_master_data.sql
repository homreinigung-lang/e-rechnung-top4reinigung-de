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

comment on column public.employees.birth_date is 'Employee date of birth.';
comment on column public.employees.contract_end is 'Contract end date; null for unlimited contracts.';
comment on column public.employees.has_driving_license is 'Whether the employee has a driving licence.';
comment on column public.employees.driving_license_classes is 'Driving licence classes, e.g. B, BE, C1.';
comment on column public.employees.qualification is 'Vocational training / qualification, e.g. Gebäudereiniger Ausbildung.';
comment on column public.employees.has_experience_certificate is 'Whether an experience/reference certificate is available.';
comment on column public.employees.experience_details is 'Experience/certificate details.';
comment on column public.employees.personnel_notes is 'Internal personnel master-data notes.';
