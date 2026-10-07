-- Employee work entries must await administrative approval, even from older clients
-- that omit approval_status (whose historical column default is 'approved').
-- Owner-created entries and existing historical rows remain unchanged.
begin;

create or replace function public.time_entries_employee_pending_on_insert()
returns trigger
language plpgsql
security invoker
set search_path = public
as $pending$
begin
  if new.entry_type = 'work'
     and auth.uid() is not null
     and new.employee_id = public.my_employee_id()
     and new.user_id = public.my_employee_owner() then
    new.approval_status := 'pending';
    new.decided_at := null;
    new.decided_by := null;
    new.decision_note := '';
  end if;
  return new;
end;
$pending$;

revoke all on function public.time_entries_employee_pending_on_insert()
  from public, anon, authenticated;

create or replace trigger t_time_entries_employee_pending
before insert on public.time_entries
for each row execute function public.time_entries_employee_pending_on_insert();

alter policy "employee records own work time" on public.time_entries
  with check (
    employee_id = public.my_employee_id()
    and user_id = public.my_employee_owner()
    and billed = false
    and entry_type = 'work'
    and approval_status = 'pending'
    and decided_at is null
    and decided_by is null
  );

commit;
