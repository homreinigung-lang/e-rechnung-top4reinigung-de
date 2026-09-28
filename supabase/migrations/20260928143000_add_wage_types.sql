create table if not exists public.wage_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  kind text not null default 'other'
    check (kind in ('normal','overtime','night','sunday','holiday','vacation','sick','other')),
  surcharge_percent numeric(7,2) not null default 0
    check (surcharge_percent >= 0 and surcharge_percent <= 500),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, code)
);

create index if not exists wage_types_user_active_idx
  on public.wage_types(user_id, active);

alter table public.wage_types enable row level security;

drop policy if exists "own wage types" on public.wage_types;
create policy "own wage types"
  on public.wage_types
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into public.wage_types (user_id, code, name, kind, surcharge_percent, active)
select cs.user_id, seed.code, seed.name, seed.kind, 0, true
from public.company_settings cs
cross join (
  values
    ('NORMAL', 'Normalstunden', 'normal'),
    ('UEBERSTUNDEN', 'Überstunden', 'overtime'),
    ('NACHT', 'Nachtarbeit', 'night'),
    ('SONNTAG', 'Sonntagsarbeit', 'sunday'),
    ('FEIERTAG', 'Feiertagsarbeit', 'holiday'),
    ('URLAUB', 'Urlaub', 'vacation'),
    ('KRANK', 'Krankheit / Lohnfortzahlung', 'sick')
) as seed(code, name, kind)
on conflict (user_id, code) do nothing;

comment on table public.wage_types is
  'Firmeneigene Lohnarten für die Lohnvorbereitung. Zuschlagsprozente sind bewusst konfigurierbar und keine steuerliche Lohnabrechnung.';
