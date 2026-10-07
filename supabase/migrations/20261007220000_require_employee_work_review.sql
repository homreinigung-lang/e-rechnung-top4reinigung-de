-- Work time entered by employees must be pending until approved by the owner.
-- Existing records and owner-created work entries are unchanged.
begin;

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
