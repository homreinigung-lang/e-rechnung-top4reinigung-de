begin;

create table if not exists public.payroll_handoffs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  status text not null default 'draft'
    check (status in ('draft','reviewed','transferred')),
  reviewed_at timestamptz,
  transferred_at timestamptz,
  note text not null default '',
  gross_prepared numeric(12,2) not null default 0,
  hours_prepared numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(user_id, employee_id, period)
);

create index if not exists payroll_handoffs_user_period_idx
  on public.payroll_handoffs(user_id, period, status);

alter table public.payroll_handoffs enable row level security;
revoke all on public.payroll_handoffs from public, anon, authenticated;
grant select, insert, update, delete on public.payroll_handoffs to authenticated;
grant all on public.payroll_handoffs to service_role;

drop policy if exists "Owner manages own payroll handoffs" on public.payroll_handoffs;
create policy "Owner manages own payroll handoffs"
  on public.payroll_handoffs for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.validate_payroll_handoff_owner()
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
    select 1 from public.employees e
    where e.id = new.employee_id and e.user_id = new.user_id
  ) then
    raise exception 'Mitarbeiter gehört nicht zu diesem Konto';
  end if;

  if new.status = 'reviewed' and new.reviewed_at is null then
    new.reviewed_at := now();
  end if;
  if new.status = 'transferred' then
    if new.reviewed_at is null then new.reviewed_at := now(); end if;
    if new.transferred_at is null then new.transferred_at := now(); end if;
  end if;
  if new.status = 'draft' then
    new.reviewed_at := null;
    new.transferred_at := null;
  elsif new.status = 'reviewed' then
    new.transferred_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.validate_payroll_handoff_owner() from public, anon, authenticated;

drop trigger if exists validate_payroll_handoff_owner_trigger on public.payroll_handoffs;
create trigger validate_payroll_handoff_owner_trigger
before insert or update on public.payroll_handoffs
for each row execute function public.validate_payroll_handoff_owner();

commit;
