-- Digitale Objektmappe: projektbezogene Dateien mit strikter Mandantentrennung.
begin;

create table if not exists public.project_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  file_name text not null check (char_length(btrim(file_name)) between 1 and 255),
  file_path text not null check (char_length(btrim(file_path)) between 1 and 1000),
  category text not null default 'sonstiges'
    check (category in ('vertrag','leistungsverzeichnis','foto','arbeitsschein','sonstiges')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists project_files_project_created_idx
  on public.project_files(project_id, created_at desc);
create index if not exists project_files_user_category_idx
  on public.project_files(user_id, category);

alter table public.project_files enable row level security;

revoke all on public.project_files from public, anon, authenticated;
grant select, insert, update, delete on public.project_files to authenticated;
grant all on public.project_files to service_role;

drop policy if exists "Owner manages own project files" on public.project_files;
create policy "Owner manages own project files"
  on public.project_files for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.project_files_validate_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Nicht angemeldet oder falscher Mandant';
  end if;

  if not exists (
    select 1
    from public.projects p
    where p.id = new.project_id
      and p.user_id = new.user_id
  ) then
    raise exception 'Objekt gehört nicht zu diesem Konto';
  end if;

  return new;
end;
$$;

revoke all on function public.project_files_validate_project() from public, anon, authenticated;

drop trigger if exists project_files_validate_project_trigger on public.project_files;
create trigger project_files_validate_project_trigger
before insert or update on public.project_files
for each row execute function public.project_files_validate_project();

commit;
