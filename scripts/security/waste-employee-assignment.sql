alter table public.project_waste_dates add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists project_waste_dates_employee_idx on public.project_waste_dates(employee_id,collection_date);
-- Only employees already assigned to the same Objekt may be selected.
create or replace function public.validate_waste_employee_assignment() returns trigger language plpgsql set search_path = '' as $$
begin
 if new.employee_id is not null and not exists (
  select 1 from public.project_assignments a
  where a.project_id = new.project_id and a.employee_id = new.employee_id and a.user_id = new.user_id
 ) then raise exception 'Mitarbeiter ist diesem Objekt nicht zugeordnet'; end if;
 return new;
end; $$;
drop trigger if exists validate_waste_employee_assignment_trigger on public.project_waste_dates;
create trigger validate_waste_employee_assignment_trigger before insert or update of employee_id,project_id,user_id on public.project_waste_dates
for each row execute function public.validate_waste_employee_assignment();
revoke all on function public.validate_waste_employee_assignment() from public, anon, authenticated;
