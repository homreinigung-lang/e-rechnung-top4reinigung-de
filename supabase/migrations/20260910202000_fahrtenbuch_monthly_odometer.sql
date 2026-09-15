create table if not exists public.fahrtenbuch_monthly_odometer (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid not null references public.fahrtenbuch_vehicles(id) on delete cascade,
  month date not null,
  start_km numeric(12,1) not null check (start_km >= 0),
  end_km numeric(12,1) check (end_km is null or end_km >= start_km),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, vehicle_id, month)
);

alter table public.fahrtenbuch_monthly_odometer enable row level security;

drop policy if exists "owners manage own monthly odometer" on public.fahrtenbuch_monthly_odometer;
create policy "owners manage own monthly odometer" on public.fahrtenbuch_monthly_odometer
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists fahrtenbuch_monthly_odometer_user_month_idx
  on public.fahrtenbuch_monthly_odometer(user_id, month);
