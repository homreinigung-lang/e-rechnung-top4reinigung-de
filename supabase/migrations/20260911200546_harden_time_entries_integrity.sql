CREATE OR REPLACE FUNCTION public.time_entries_enforce_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  emp public.employees%ROWTYPE;
  has_overlap boolean;
BEGIN
  IF NEW.employee_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO emp FROM public.employees WHERE id = NEW.employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ungültiger Mitarbeiter.';
  END IF;

  -- Wenn ein Mitarbeiter seine eigenen Zeiten erfasst, dürfen kritische Werte
  -- nicht frei aus dem Client übernommen werden.
  IF auth.uid() IS NOT NULL AND emp.auth_user_id = auth.uid() THEN
    IF NEW.user_id IS DISTINCT FROM emp.user_id THEN
      RAISE EXCEPTION 'Mitarbeiter darf keine fremde Firma verwenden.';
    END IF;

    NEW.user_id := emp.user_id;
    NEW.employee_name := emp.name;
    NEW.hourly_rate := COALESCE(emp.hourly_rate, 0);

    IF NEW.entry_type = 'work' THEN
      IF NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
        RAISE EXCEPTION 'Start- und Endzeit sind für Arbeitszeiten erforderlich.';
      END IF;
      IF NEW.end_time <= NEW.start_time THEN
        RAISE EXCEPTION 'Endzeit muss nach der Startzeit liegen. Nachtschichten müssen ausdrücklich geplant werden.';
      END IF;
      NEW.hours := ROUND(
        GREATEST(
          0,
          EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 3600.0 - COALESCE(NEW.break_minutes, 0) / 60.0
        )::numeric,
        2
      );

      IF NEW.project_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.projects p WHERE p.id = NEW.project_id AND p.user_id = emp.user_id
      ) THEN
        RAISE EXCEPTION 'Projekt gehört nicht zur Firma des Mitarbeiters.';
      END IF;

      IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.customers c WHERE c.id = NEW.customer_id AND c.user_id = emp.user_id
      ) THEN
        RAISE EXCEPTION 'Kunde gehört nicht zur Firma des Mitarbeiters.';
      END IF;
    END IF;
  END IF;

  -- Keine stillschweigende 23-Stunden-Buchung und keine Überlappung bei Arbeitseinsätzen.
  IF NEW.entry_type = 'work' AND NEW.start_time IS NOT NULL AND NEW.end_time IS NOT NULL THEN
    IF NEW.end_time <= NEW.start_time THEN
      RAISE EXCEPTION 'Endzeit muss nach der Startzeit liegen.';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.time_entries t
      WHERE t.employee_id = NEW.employee_id
        AND t.work_date = NEW.work_date
        AND t.entry_type = 'work'
        AND COALESCE(t.approval_status, 'approved') <> 'rejected'
        AND t.id IS DISTINCT FROM NEW.id
        AND t.start_time IS NOT NULL
        AND t.end_time IS NOT NULL
        AND NEW.start_time < t.end_time
        AND NEW.end_time > t.start_time
    ) INTO has_overlap;

    IF has_overlap THEN
      RAISE EXCEPTION 'Doppelbuchung: Für diesen Mitarbeiter überschneidet sich bereits ein Einsatz.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS t_time_entries_integrity ON public.time_entries;
CREATE TRIGGER t_time_entries_integrity
BEFORE INSERT OR UPDATE OF employee_id, user_id, employee_name, work_date, start_time, end_time, break_minutes, hours, hourly_rate, project_id, customer_id, entry_type, approval_status
ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.time_entries_enforce_integrity();
