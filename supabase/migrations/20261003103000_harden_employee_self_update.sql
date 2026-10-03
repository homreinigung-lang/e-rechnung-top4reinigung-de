-- Restrict employee self-service updates to personal/contact profile fields only.
-- Employer-controlled HR fields must remain unchanged when an employee edits their own row.

create or replace function public.employee_self_update_allowed(
  _id uuid,
  _user_id uuid,
  _auth_user_id uuid,
  _email text,
  _role text,
  _hourly_rate numeric,
  _active boolean,
  _personnel_number text,
  _created_at timestamptz,
  _work_location text,
  _contract_type text,
  _contract_start date,
  _contract_end date,
  _weekly_hours numeric,
  _vacation_days_per_year numeric,
  _vacation_carryover_days numeric,
  _has_driving_license boolean,
  _driving_license_classes text,
  _qualification text,
  _has_experience_certificate boolean,
  _experience_details text,
  _personnel_notes text
)
returns boolean
language sql
stable
set search_path = public
as $function$
  select exists (
    select 1
      from public.employees o
     where o.id = _id
       and o.auth_user_id = auth.uid()
       and o.user_id is not distinct from _user_id
       and o.auth_user_id is not distinct from _auth_user_id
       and o.email is not distinct from _email
       and o.role is not distinct from _role
       and o.hourly_rate is not distinct from _hourly_rate
       and o.active is not distinct from _active
       and o.personnel_number is not distinct from _personnel_number
       and o.created_at is not distinct from _created_at
       and o.work_location is not distinct from _work_location
       and o.contract_type is not distinct from _contract_type
       and o.contract_start is not distinct from _contract_start
       and o.contract_end is not distinct from _contract_end
       and o.weekly_hours is not distinct from _weekly_hours
       and o.vacation_days_per_year is not distinct from _vacation_days_per_year
       and o.vacation_carryover_days is not distinct from _vacation_carryover_days
       and o.has_driving_license is not distinct from _has_driving_license
       and o.driving_license_classes is not distinct from _driving_license_classes
       and o.qualification is not distinct from _qualification
       and o.has_experience_certificate is not distinct from _has_experience_certificate
       and o.experience_details is not distinct from _experience_details
       and o.personnel_notes is not distinct from _personnel_notes
  );
$function$;

revoke all on function public.employee_self_update_allowed(
  uuid, uuid, uuid, text, text, numeric, boolean, text, timestamptz,
  text, text, date, date, numeric, numeric, numeric, boolean, text,
  text, boolean, text, text
) from public, anon;
grant execute on function public.employee_self_update_allowed(
  uuid, uuid, uuid, text, text, numeric, boolean, text, timestamptz,
  text, text, date, date, numeric, numeric, numeric, boolean, text,
  text, boolean, text, text
) to authenticated, service_role;

drop policy if exists "employee updates own record" on public.employees;
create policy "employee updates own record"
on public.employees
for update
to authenticated
using (auth_user_id = auth.uid())
with check (
  auth_user_id = auth.uid()
  and public.employee_self_update_allowed(
    id,
    user_id,
    auth_user_id,
    email,
    role,
    hourly_rate,
    active,
    personnel_number,
    created_at,
    work_location,
    contract_type,
    contract_start,
    contract_end,
    weekly_hours,
    vacation_days_per_year,
    vacation_carryover_days,
    has_driving_license,
    driving_license_classes,
    qualification,
    has_experience_certificate,
    experience_details,
    personnel_notes
  )
);

-- The previous helper signature is no longer referenced by any policy.
drop function if exists public.employee_self_update_allowed(
  uuid, uuid, uuid, text, text, numeric, boolean, text, text, date, numeric
);
