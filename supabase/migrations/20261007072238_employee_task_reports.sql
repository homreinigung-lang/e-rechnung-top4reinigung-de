begin;
create table public.employee_task_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  assignment_id uuid references public.project_assignments(id) on delete set null,
  work_date date not null,
  kind text not null check (kind in ('material','problem')),
  material_name text not null default '' check (char_length(material_name) <= 180),
  quantity numeric(12,2) check (quantity > 0),
  unit text not null default '' check (char_length(unit) <= 30),
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3),
  status text not null default 'offen' check (status in ('offen','in_bearbeitung','erledigt')),
  admin_reply text not null default '' check (char_length(admin_reply) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'material' or char_length(btrim(material_name)) > 0)
);
create index employee_task_reports_owner_status_idx on public.employee_task_reports(user_id,status,created_at desc);
create index employee_task_reports_employee_idx on public.employee_task_reports(employee_id,created_at desc);
create index employee_task_reports_project_idx on public.employee_task_reports(project_id);
create index employee_task_reports_assignment_idx on public.employee_task_reports(assignment_id,work_date);
alter table public.employee_task_reports enable row level security;
revoke all on public.employee_task_reports from public,anon,authenticated;
grant select,insert,update on public.employee_task_reports to authenticated;
grant all on public.employee_task_reports to service_role;
create policy "Owner reads reports" on public.employee_task_reports for select to authenticated using (user_id = (select auth.uid()));
create policy "Owner responds to reports" on public.employee_task_reports for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Employee reads own reports" on public.employee_task_reports for select to authenticated using (
  exists(select 1 from public.employees e where e.id = employee_id and e.auth_user_id = (select auth.uid()) and e.user_id = employee_task_reports.user_id)
);
create policy "Employee creates own reports" on public.employee_task_reports for insert to authenticated with check (
  status = 'offen' and admin_reply = '' and
  exists(select 1 from public.employees e join public.project_assignments a on a.employee_id = e.id
    where e.id = employee_task_reports.employee_id and e.auth_user_id = (select auth.uid()) and e.active
      and e.user_id = employee_task_reports.user_id and a.id = employee_task_reports.assignment_id
      and a.project_id = employee_task_reports.project_id)
);
create policy "Gesperrte Konten ausgeschlossen" on public.employee_task_reports as restrictive for all to authenticated
  using ((select app_private.is_account_active())) with check ((select app_private.is_account_active()));

-- Invoker rights: all reference checks use only caller-visible rows. No privileged RPC.
create function public.validate_employee_task_report() returns trigger language plpgsql security invoker set search_path = '' as $$
declare a public.project_assignments%rowtype; uploader uuid; path text;
begin
  if tg_op = 'UPDATE' then
    -- A deleted plan may detach its FK without rewriting the historical report.
    if pg_trigger_depth() > 1 and new.assignment_id is null and old.assignment_id is not null
      and (to_jsonb(new) - 'assignment_id') = (to_jsonb(old) - 'assignment_id') then return new; end if;
    if (to_jsonb(new) - array['status','admin_reply','updated_at']) is distinct from (to_jsonb(old) - array['status','admin_reply','updated_at']) then
      raise exception 'Nur Antwort und Bearbeitungsstatus dürfen geändert werden.';
    end if;
    new.updated_at := now();
    return new;
  end if;
  select * into a from public.project_assignments where id = new.assignment_id;
  if not found or a.employee_id <> new.employee_id or a.project_id <> new.project_id then
    raise exception 'Meldung gehört nicht zu diesem Einsatz.';
  end if;
  if not exists(select 1 from public.employees e where e.id = new.employee_id and e.user_id = new.user_id)
    or not exists(select 1 from public.projects p where p.id = new.project_id and p.user_id = new.user_id) then
    raise exception 'Einsatz und Mitarbeiter müssen zum selben Betrieb gehören.';
  end if;
  if (a.start_date is not null and new.work_date < a.start_date) or (a.end_date is not null and new.work_date > a.end_date) then
    raise exception 'Datum liegt außerhalb des Einsatzzeitraums.';
  end if;
  uploader := auth.uid();
  foreach path in array new.photo_paths loop
    if path is null or path not like uploader::text || '/einsatzmeldungen/' || new.id::text || '/%'
      or path ~ '(^|/)\.\.(/|$)' then
      raise exception 'Foto gehört nicht zu dieser Meldung.';
    end if;
  end loop;
  new.created_at := now(); new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.validate_employee_task_report() from public,anon,authenticated;
create trigger employee_task_report_validation before insert or update on public.employee_task_reports
for each row execute function public.validate_employee_task_report();
commit;
