-- Employee trips belong to the owner's Fahrtenbuch. Employees may only add and
-- read their own trips, and may choose only their employer's vehicles.
ALTER TABLE public.fahrtenbuch_entries
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fahrtenbuch_entries_employee_date
  ON public.fahrtenbuch_entries (employee_id, trip_date DESC, created_at DESC);

DROP POLICY IF EXISTS "Employee views company Fahrtenbuch vehicles" ON public.fahrtenbuch_vehicles;
CREATE POLICY "Employee views company Fahrtenbuch vehicles"
  ON public.fahrtenbuch_vehicles FOR SELECT TO authenticated
  USING (user_id = (SELECT public.my_employee_owner()));

DROP POLICY IF EXISTS "Employee views own Fahrtenbuch trips" ON public.fahrtenbuch_entries;
CREATE POLICY "Employee views own Fahrtenbuch trips"
  ON public.fahrtenbuch_entries FOR SELECT TO authenticated
  USING (employee_id = (SELECT public.my_employee_id())
    AND user_id = (SELECT public.my_employee_owner()));

DROP POLICY IF EXISTS "Employee inserts own Fahrtenbuch trip" ON public.fahrtenbuch_entries;
CREATE POLICY "Employee inserts own Fahrtenbuch trip"
  ON public.fahrtenbuch_entries FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = (SELECT public.my_employee_id())
    AND user_id = (SELECT public.my_employee_owner())
    AND vehicle_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.fahrtenbuch_vehicles v
      WHERE v.id = fahrtenbuch_entries.vehicle_id
        AND v.user_id = fahrtenbuch_entries.user_id
    )
  );
