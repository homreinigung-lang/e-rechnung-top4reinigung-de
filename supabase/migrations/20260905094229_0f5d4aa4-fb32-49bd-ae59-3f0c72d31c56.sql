ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_status_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_status_check CHECK (status IN ('active','completed','cancelled'));

ALTER TABLE public.time_entries DISABLE TRIGGER t_time_entries_employee_photo_only;
ALTER TABLE public.time_entries DISABLE TRIGGER t_time_entries_no_overlap;
ALTER TABLE public.time_entries DISABLE TRIGGER t_time_entries_validate;

UPDATE public.time_entries
   SET status = CASE
     WHEN approval_status = 'rejected' THEN 'cancelled'
     WHEN completed_at IS NOT NULL THEN 'completed'
     ELSE 'active'
   END;

ALTER TABLE public.time_entries ENABLE TRIGGER t_time_entries_employee_photo_only;
ALTER TABLE public.time_entries ENABLE TRIGGER t_time_entries_no_overlap;
ALTER TABLE public.time_entries ENABLE TRIGGER t_time_entries_validate;

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
  ELSIF NEW.status IS NULL OR NEW.status = 'cancelled' THEN
    NEW.status := 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_time_entries_sync_status ON public.time_entries;
CREATE TRIGGER t_time_entries_sync_status
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_sync_status();

CREATE OR REPLACE FUNCTION public.time_entries_protect_completed()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'completed' THEN
      RAISE EXCEPTION 'Abgeschlossene Einsätze können nicht gelöscht werden.';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'completed' AND (
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

DROP TRIGGER IF EXISTS t_time_entries_protect_completed ON public.time_entries;
CREATE TRIGGER t_time_entries_protect_completed
  BEFORE UPDATE OR DELETE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_protect_completed();