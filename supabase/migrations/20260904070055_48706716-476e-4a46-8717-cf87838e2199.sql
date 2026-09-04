CREATE OR REPLACE FUNCTION public.time_entries_no_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE conflict record;
BEGIN
  IF NEW.entry_type <> 'work' OR NEW.employee_id IS NULL
     OR NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.end_time <= NEW.start_time THEN
    RETURN NEW; -- Nachtschichten werden nicht auf Überschneidung geprüft
  END IF;

  SELECT t.start_time, t.end_time INTO conflict
    FROM public.time_entries t
   WHERE t.employee_id = NEW.employee_id
     AND t.work_date = NEW.work_date
     AND t.entry_type = 'work'
     AND t.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND t.start_time IS NOT NULL AND t.end_time IS NOT NULL
     AND t.end_time > t.start_time
     AND t.start_time < NEW.end_time
     AND t.end_time > NEW.start_time
   LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Überschneidung: Für diesen Mitarbeiter ist am % bereits % bis % geplant.',
      to_char(NEW.work_date, 'DD.MM.YYYY'),
      to_char(conflict.start_time, 'HH24:MI'),
      to_char(conflict.end_time, 'HH24:MI');
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.time_entries_no_overlap() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS t_time_entries_no_overlap ON public.time_entries;
CREATE TRIGGER t_time_entries_no_overlap
  BEFORE INSERT OR UPDATE ON public.time_entries
  FOR EACH ROW EXECUTE FUNCTION public.time_entries_no_overlap();