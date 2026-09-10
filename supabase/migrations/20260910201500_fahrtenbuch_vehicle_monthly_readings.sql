create table if not exists public.fahrtenbuch_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_name text not null default '',
  license_plate text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, license_plate)
);

alter table public.fahrtenbuch_vehicles enable row level security;

drop policy if exists "Users manage own fahrtenbuch vehicles" on public.fahrtenbuch_vehicles;
create policy "Users manage own fahrtenbuch vehicles"
on public.fahrtenbuch_vehicles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create table if not exists public.fahrtenbuch_monthly_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.fahrtenbuch_vehicles(id) on delete cascade,
  month date not null,
  start_km numeric(12,1) not null check (start_km >= 0),
  end_km numeric(12,1) not null check (end_km >= start_km),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, vehicle_id, month),
  check (month = date_trunc('month', month)::date)
);

alter table public.fahrtenbuch_monthly_readings enable row level security;

drop policy if exists "Users manage own fahrtenbuch monthly readings" on public.fahrtenbuch_monthly_readings;
create policy "Users manage own fahrtenbuch monthly readings"
on public.fahrtenbuch_monthly_readings
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

alter table public.fahrtenbuch_entries
  add column if not exists vehicle_id uuid references public.fahrtenbuch_vehicles(id) on delete set null;

create index if not exists idx_fahrtenbuch_entries_vehicle_date
  on public.fahrtenbuch_entries (vehicle_id, trip_date);
create index if not exists idx_fahrtenbuch_monthly_readings_vehicle_month
  on public.fahrtenbuch_monthly_readings (vehicle_id, month);