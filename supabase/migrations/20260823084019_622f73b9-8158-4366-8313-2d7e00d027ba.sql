CREATE OR REPLACE FUNCTION public.employee_self_update_allowed(
  _id uuid, _user_id uuid, _auth_user_id uuid, _email text, _role text,
  _hourly_rate numeric, _active boolean, _personnel_number text,
  _contract_type text, _contract_start date, _weekly_hours numeric
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees o
     WHERE o.id = _id
       AND o.auth_user_id = auth.uid()
       AND o.user_id IS NOT DISTINCT FROM _user_id
       AND o.auth_user_id IS NOT DISTINCT FROM _auth_user_id
       AND o.email IS NOT DISTINCT FROM _email
       AND o.role IS NOT DISTINCT FROM _role
       AND o.hourly_rate IS NOT DISTINCT FROM _hourly_rate
       AND o.active IS NOT DISTINCT FROM _active
       AND o.personnel_number IS NOT DISTINCT FROM _personnel_number
       AND o.contract_type IS NOT DISTINCT FROM _contract_type
       AND o.contract_start IS NOT DISTINCT FROM _contract_start
       AND o.weekly_hours IS NOT DISTINCT FROM _weekly_hours
  );
$$;

REVOKE ALL ON FUNCTION public.employee_self_update_allowed(uuid,uuid,uuid,text,text,numeric,boolean,text,text,date,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_self_update_allowed(uuid,uuid,uuid,text,text,numeric,boolean,text,text,date,numeric) TO authenticated, service_role;

DROP POLICY IF EXISTS "employee updates own record" ON public.employees;
CREATE POLICY "employee updates own record" ON public.employees
FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (
  auth_user_id = auth.uid()
  AND public.employee_self_update_allowed(id, user_id, auth_user_id, email, role, hourly_rate, active, personnel_number, contract_type, contract_start, weekly_hours)
);

CREATE OR REPLACE FUNCTION public.time_entry_photo_update_allowed(
  _id uuid, _user_id uuid, _employee_id uuid, _employee_name text, _customer_id uuid,
  _work_date date, _start_time time, _end_time time, _break_minutes integer,
  _hours numeric, _hourly_rate numeric, _location text, _note text, _billed boolean,
  _project_id uuid, _entry_type text, _absence_reason text, _approval_status text,
  _decided_at timestamptz, _decided_by uuid, _decision_note text, _completed_at timestamptz
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.time_entries o
     WHERE o.id = _id
       AND o.employee_id = public.my_employee_id()
       AND o.user_id IS NOT DISTINCT FROM _user_id
       AND o.employee_id IS NOT DISTINCT FROM _employee_id
       AND o.employee_name IS NOT DISTINCT FROM _employee_name
       AND o.customer_id IS NOT DISTINCT FROM _customer_id
       AND o.work_date IS NOT DISTINCT FROM _work_date
       AND o.start_time IS NOT DISTINCT FROM _start_time
       AND o.end_time IS NOT DISTINCT FROM _end_time
       AND o.break_minutes IS NOT DISTINCT FROM _break_minutes
       AND o.hours IS NOT DISTINCT FROM _hours
       AND o.hourly_rate IS NOT DISTINCT FROM _hourly_rate
       AND o.location IS NOT DISTINCT FROM _location
       AND o.note IS NOT DISTINCT FROM _note
       AND o.billed IS NOT DISTINCT FROM _billed
       AND o.project_id IS NOT DISTINCT FROM _project_id
       AND o.entry_type IS NOT DISTINCT FROM _entry_type
       AND o.absence_reason IS NOT DISTINCT FROM _absence_reason
       AND o.approval_status IS NOT DISTINCT FROM _approval_status
       AND o.decided_at IS NOT DISTINCT FROM _decided_at
       AND o.decided_by IS NOT DISTINCT FROM _decided_by
       AND o.decision_note IS NOT DISTINCT FROM _decision_note
       AND o.completed_at IS NOT DISTINCT FROM _completed_at
  );
$$;

REVOKE ALL ON FUNCTION public.time_entry_photo_update_allowed(uuid,uuid,uuid,text,uuid,date,time,time,integer,numeric,numeric,text,text,boolean,uuid,text,text,text,timestamptz,uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.time_entry_photo_update_allowed(uuid,uuid,uuid,text,uuid,date,time,time,integer,numeric,numeric,text,text,boolean,uuid,text,text,text,timestamptz,uuid,text,timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "employee attaches photos to own entries" ON public.time_entries;
CREATE POLICY "employee attaches photos to own entries" ON public.time_entries
FOR UPDATE TO authenticated
USING (employee_id = public.my_employee_id())
WITH CHECK (
  employee_id = public.my_employee_id()
  AND public.time_entry_photo_update_allowed(id, user_id, employee_id, employee_name, customer_id, work_date, start_time, end_time, break_minutes, hours, hourly_rate, location, note, billed, project_id, entry_type, absence_reason, approval_status, decided_at, decided_by, decision_note, completed_at)
);