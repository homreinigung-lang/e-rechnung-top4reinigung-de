-- Opt-in KI-Kalkulation experience history; no automated pricing changes.
create table if not exists public.ki_training_experiences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cleaning_type text not null check (length(trim(cleaning_type)) between 1 and 160),
  area_sqm numeric(12,2) not null check (area_sqm > 0 and area_sqm <= 10000000),
  estimated_labor_hours numeric(12,2) not null check (estimated_labor_hours > 0 and estimated_labor_hours <= 1000000),
  actual_labor_hours numeric(12,2) not null check (actual_labor_hours > 0 and actual_labor_hours <= 1000000),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
alter table public.ki_training_experiences enable row level security;
revoke all on public.ki_training_experiences from anon;
grant select, insert, delete on public.ki_training_experiences to authenticated;
create policy "ki_training_select_own" on public.ki_training_experiences for select to authenticated using ((select auth.uid()) = user_id);
create policy "ki_training_insert_own" on public.ki_training_experiences for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "ki_training_delete_own" on public.ki_training_experiences for delete to authenticated using ((select auth.uid()) = user_id);
create index if not exists ki_training_user_type_idx on public.ki_training_experiences(user_id, cleaning_type, created_at desc);
