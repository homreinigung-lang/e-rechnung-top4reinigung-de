ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS vacation_days_per_year numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vacation_carryover_days numeric NOT NULL DEFAULT 0;

-- Doppelte Abwesenheiten bereinigen (ältesten Eintrag behalten)
DELETE FROM public.time_entries t
 USING public.time_entries k
 WHERE t.entry_type = 'absence' AND k.entry_type = 'absence'
   AND t.employee_id IS NOT NULL
   AND t.employee_id = k.employee_id
   AND t.work_date = k.work_date
   AND COALESCE(t.approval_status,'approved') <> 'rejected'
   AND COALESCE(k.approval_status,'approved') <> 'rejected'
   AND (k.created_at, k.id) < (t.created_at, t.id);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_one_absence_per_day
  ON public.time_entries (employee_id, work_date)
  WHERE entry_type = 'absence' AND employee_id IS NOT NULL
        AND COALESCE(approval_status, 'approved') <> 'rejected';

-- Exakt doppelte Einsätze bereinigen
DELETE FROM public.time_entries t
 USING public.time_entries k
 WHERE t.entry_type = 'work' AND k.entry_type = 'work'
   AND t.employee_id IS NOT NULL AND t.employee_id = k.employee_id
   AND t.work_date = k.work_date
   AND t.start_time IS NOT NULL AND t.start_time = k.start_time
   AND t.end_time IS NOT DISTINCT FROM k.end_time
   AND (k.created_at, k.id) < (t.created_at, t.id);

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_no_duplicate_shift
  ON public.time_entries (employee_id, work_date, start_time, end_time)
  WHERE entry_type = 'work' AND employee_id IS NOT NULL AND start_time IS NOT NULL;

CREATE OR REPLACE FUNCTION public.time_entries_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE emp public.employees;
BEGIN
  IF COALESCE(NEW.hours, 0) < 0 OR COALESCE(NEW.hours, 0) > 24 THEN
    RAISE EXCEPTION 'Die Stundenzahl muss zwischen 0 und 24 Stunden liegen.';
  END IF;

  IF NEW.project_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.projects p WHERE p.id = NEW.project_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Das gewählte Objekt gehört nicht zu diesem Unternehmen.';
  END IF;

  IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Der gewählte Kunde gehört nicht zu diesem Unternehmen.';
  END IF;

  -- Mitarbeitende dürfen ihren eigenen Stundensatz nicht setzen
  IF auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id AND NEW.employee_id IS NOT NULL THEN
    SELECT * INTO emp FROM public.employees e WHERE e.id = NEW.employee_id;
    IF NOT FOUND OR emp.auth_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Zeiteinträge dürfen nur für das eigene Mitarbeiterkonto erfasst werden.';
    END IF;
    NEW.hourly_rate := COALESCE(emp.hourly_rate, 0);
    NEW.employee_name := emp.name;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_time_entries_validate ON public.time_entries;
CREATE TRIGGER t_time_entries_validate
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_validate();