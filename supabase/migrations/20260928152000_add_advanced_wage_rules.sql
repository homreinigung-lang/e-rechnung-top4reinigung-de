alter table public.wage_types
  add column if not exists time_from time,
  add column if not exists time_to time;

comment on column public.wage_types.time_from is
  'Optionale Startzeit einer zeitabhängigen Lohnart, z. B. Nachtarbeit.';
comment on column public.wage_types.time_to is
  'Optionale Endzeit einer zeitabhängigen Lohnart, auch über Mitternacht.';

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  holiday_date date not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, holiday_date)
);

create index if not exists company_holidays_user_date_idx
  on public.company_holidays(user_id, holiday_date);

alter table public.company_holidays enable row level security;

drop policy if exists "own company holidays" on public.company_holidays;
create policy "own company holidays"
  on public.company_holidays
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.company_holidays is
  'Feiertage/arbeitsfreie Sondertage je Firma für die Lohnvorbereitung. Keine automatische Rechtsberatung; nur explizit gepflegte Daten werden verwendet.';
