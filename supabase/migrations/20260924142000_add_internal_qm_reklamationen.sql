-- Internal QM / Reklamationen for company administration only.
-- Customers do not receive direct access. Tenant references are validated explicitly.

begin;

create table if not exists public.qm_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  assigned_employee_id uuid references public.employees(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 1 and 180),
  description text not null default '',
  category text not null default 'reinigung'
    check (category in ('reinigung','personal','termin','material','sonstiges')),
  priority text not null default 'mittel'
    check (priority in ('niedrig','mittel','hoch')),
  status text not null default 'neu'
    check (status in ('neu','in_bearbeitung','erledigt')),
  due_date date,
  action_note text not null default '',
  solution text not null default '',
  attachment_paths text[] not null default '{}',
  occurred_at date not null default current_date,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qm_case_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null references public.qm_cases(id) on delete cascade,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qm_cases_user_status_due_idx
  on public.qm_cases(user_id, status, due_date);
create index if not exists qm_cases_project_idx on public.qm_cases(project_id);
create index if not exists qm_cases_customer_idx on public.qm_cases(customer_id);
create index if not exists qm_cases_assigned_employee_idx on public.qm_cases(assigned_employee_id);
create index if not exists qm_case_events_case_created_idx
  on public.qm_case_events(case_id, created_at desc);

alter table public.qm_cases enable row level security;
alter table public.qm_case_events enable row level security;

revoke all on public.qm_cases, public.qm_case_events from public, anon, authenticated;
grant select, insert, update, delete on public.qm_cases to authenticated;
grant select on public.qm_case_events to authenticated;
grant all on public.qm_cases, public.qm_case_events to service_role;

drop policy if exists "Owner manages own QM cases" on public.qm_cases;
create policy "Owner manages own QM cases"
  on public.qm_cases for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Owner reads own QM history" on public.qm_case_events;
create policy "Owner reads own QM history"
  on public.qm_case_events for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.qm_cases_validate_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_customer uuid;
begin
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Nicht angemeldet oder falscher Mandant';
  end if;

  if new.customer_id is not null and not exists (
    select 1 from public.customers c
    where c.id = new.customer_id and c.user_id = new.user_id
  ) then
    raise exception 'Kunde gehört nicht zu diesem Konto';
  end if;

  if new.project_id is not null then
    select p.customer_id into project_customer
    from public.projects p
    where p.id = new.project_id and p.user_id = new.user_id;

    if not found then
      raise exception 'Objekt gehört nicht zu diesem Konto';
    end if;

    if new.customer_id is not null
       and project_customer is not null
       and project_customer <> new.customer_id then
      raise exception 'Objekt gehört nicht zum gewählten Kunden';
    end if;
  end if;

  if new.assigned_employee_id is not null and not exists (
    select 1 from public.employees e
    where e.id = new.assigned_employee_id and e.user_id = new.user_id
  ) then
    raise exception 'Mitarbeiter gehört nicht zu diesem Konto';
  end if;

  new.updated_at := now();
  if new.status = 'erledigt' and (tg_op = 'INSERT' or old.status is distinct from 'erledigt') then
    new.resolved_at := coalesce(new.resolved_at, now());
  elsif new.status <> 'erledigt' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

revoke all on function public.qm_cases_validate_references() from public, anon, authenticated;

drop trigger if exists qm_cases_validate_references_trigger on public.qm_cases;
create trigger qm_cases_validate_references_trigger
before insert or update on public.qm_cases
for each row execute function public.qm_cases_validate_references();

create or replace function public.qm_cases_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  kind text;
begin
  if tg_op = 'INSERT' then
    kind := 'erstellt';
    payload := jsonb_build_object(
      'status', new.status,
      'priority', new.priority,
      'assigned_employee_id', new.assigned_employee_id
    );
  else
    kind := 'aktualisiert';
    payload := jsonb_strip_nulls(jsonb_build_object(
      'status_von', case when old.status is distinct from new.status then old.status end,
      'status_auf', case when old.status is distinct from new.status then new.status end,
      'prioritaet_von', case when old.priority is distinct from new.priority then old.priority end,
      'prioritaet_auf', case when old.priority is distinct from new.priority then new.priority end,
      'verantwortlich_von', case when old.assigned_employee_id is distinct from new.assigned_employee_id then old.assigned_employee_id end,
      'verantwortlich_auf', case when old.assigned_employee_id is distinct from new.assigned_employee_id then new.assigned_employee_id end,
      'frist_von', case when old.due_date is distinct from new.due_date then old.due_date end,
      'frist_auf', case when old.due_date is distinct from new.due_date then new.due_date end,
      'massnahme_geaendert', case when old.action_note is distinct from new.action_note then true end,
      'loesung_geaendert', case when old.solution is distinct from new.solution then true end,
      'anhaenge_geaendert', case when old.attachment_paths is distinct from new.attachment_paths then true end
    ));
  end if;

  insert into public.qm_case_events(user_id, case_id, event_type, details)
  values (new.user_id, new.id, kind, payload);
  return new;
end;
$$;

revoke all on function public.qm_cases_audit() from public, anon, authenticated;

drop trigger if exists qm_cases_audit_trigger on public.qm_cases;
create trigger qm_cases_audit_trigger
after insert or update on public.qm_cases
for each row execute function public.qm_cases_audit();

commit;
