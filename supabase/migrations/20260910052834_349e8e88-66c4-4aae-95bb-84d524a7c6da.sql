CREATE OR REPLACE FUNCTION public.time_entries_sync_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.approval_status = 'rejected' THEN
    NEW.status := 'cancelled';
  ELSIF NEW.completed_at IS NOT NULL THEN
    NEW.status := 'completed';
  ELSE
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.time_entries_protect_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Abgeschlossene Einsätze können nicht gelöscht werden. Bitte zuerst "Erledigt zurücknehmen".';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'completed' AND NEW.completed_at IS NOT NULL AND (
       NEW.work_date IS DISTINCT FROM OLD.work_date
    OR NEW.start_time IS DISTINCT FROM OLD.start_time
    OR NEW.end_time IS DISTINCT FROM OLD.end_time
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
  ) THEN
    RAISE EXCEPTION 'Abgeschlossene Einsätze können nicht verschoben oder umgeplant werden.';
  END IF;
  RETURN NEW;
END;
$$;
