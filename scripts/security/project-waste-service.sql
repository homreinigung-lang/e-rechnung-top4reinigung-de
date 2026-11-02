-- Apply in Supabase SQL editor before enabling the Objekt Mülltonnenservice.
create table if not exists public.project_waste_settings (
 project_id uuid primary key references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 selected_bins text[] not null default '{}',
 reminder_days integer not null default 1 check (reminder_days between 0 and 7),
 check (selected_bins <@ array['rest','gelb','papier','bio']::text[])
);
create table if not exists public.project_waste_dates (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 bin_type text not null check (bin_type in ('rest','gelb','papier','bio')),
 collection_date date not null,
 put_out_done boolean not null default false,
 return_done boolean not null default false,
 unique(project_id,bin_type,collection_date)
);
create index if not exists project_waste_dates_project_date on public.project_waste_dates(project_id,collection_date);
alter table public.project_waste_settings enable row level security;
alter table public.project_waste_dates enable row level security;
drop policy if exists waste_settings_owner on public.project_waste_settings;
create policy waste_settings_owner on public.project_waste_settings for all to authenticated
 using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()) and user_id=auth.uid())
 with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()) and user_id=auth.uid());
drop policy if exists waste_dates_owner on public.project_waste_dates;
create policy waste_dates_owner on public.project_waste_dates for all to authenticated
 using (exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()) and user_id=auth.uid())
 with check (exists(select 1 from public.projects p where p.id=project_id and p.user_id=auth.uid()) and user_id=auth.uid());
