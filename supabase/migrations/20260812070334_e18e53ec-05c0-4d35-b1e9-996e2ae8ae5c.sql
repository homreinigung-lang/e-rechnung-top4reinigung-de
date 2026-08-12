ALTER TABLE public.time_entries ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}'::text[];

CREATE OR REPLACE FUNCTION public.time_entries_employee_photo_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE probe public.time_entries;
BEGIN
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;
  probe := NEW;
  probe.photo_paths := OLD.photo_paths;
  probe.updated_at := OLD.updated_at;
  IF probe IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'Mitarbeitende dürfen an eigenen Einträgen nur Fotos hinzufügen oder entfernen.';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS t_time_entries_employee_photo_only ON public.time_entries;
CREATE TRIGGER t_time_entries_employee_photo_only
BEFORE UPDATE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.time_entries_employee_photo_only();

DROP POLICY IF EXISTS "employee attaches photos to own entries" ON public.time_entries;
CREATE POLICY "employee attaches photos to own entries"
ON public.time_entries FOR UPDATE TO authenticated
USING (employee_id = public.my_employee_id())
WITH CHECK (employee_id = public.my_employee_id());