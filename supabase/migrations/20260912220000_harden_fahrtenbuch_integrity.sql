-- Forward-only integrity hardening; existing inconsistent data must fail validation.
BEGIN;

ALTER TABLE public.fahrtenbuch_vehicles
  ADD CONSTRAINT fahrtenbuch_vehicles_id_user_id_key UNIQUE (id, user_id);

ALTER TABLE public.fahrtenbuch_entries
  DROP CONSTRAINT fahrtenbuch_entries_vehicle_id_fkey,
  ADD CONSTRAINT fahrtenbuch_entries_vehicle_owner_fkey
    FOREIGN KEY (vehicle_id, user_id)
    REFERENCES public.fahrtenbuch_vehicles (id, user_id)
    ON DELETE SET NULL (vehicle_id);

ALTER TABLE public.fahrtenbuch_monthly_odometer
  DROP CONSTRAINT fahrtenbuch_monthly_odometer_vehicle_id_fkey,
  ADD CONSTRAINT fahrtenbuch_monthly_odometer_vehicle_owner_fkey
    FOREIGN KEY (vehicle_id, user_id)
    REFERENCES public.fahrtenbuch_vehicles (id, user_id) ON DELETE CASCADE;

ALTER TABLE public.fahrtenbuch_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fahrtenbuch_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fahrtenbuch_monthly_odometer ENABLE ROW LEVEL SECURITY;

DROP POLICY "Owner manages own Fahrtenbuch" ON public.fahrtenbuch_entries;
CREATE POLICY "Owner manages own Fahrtenbuch" ON public.fahrtenbuch_entries
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY "Users manage own fahrtenbuch vehicles" ON public.fahrtenbuch_vehicles;
CREATE POLICY "Users manage own fahrtenbuch vehicles" ON public.fahrtenbuch_vehicles
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY "Users manage own fahrtenbuch monthly odometer" ON public.fahrtenbuch_monthly_odometer;
DROP POLICY "owners manage own monthly odometer" ON public.fahrtenbuch_monthly_odometer;
CREATE POLICY "Users manage own fahrtenbuch monthly odometer" ON public.fahrtenbuch_monthly_odometer
  FOR ALL TO authenticated USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON public.fahrtenbuch_entries, public.fahrtenbuch_vehicles,
  public.fahrtenbuch_monthly_odometer FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fahrtenbuch_entries,
  public.fahrtenbuch_vehicles, public.fahrtenbuch_monthly_odometer TO authenticated;

GRANT ALL ON public.fahrtenbuch_entries, public.fahrtenbuch_vehicles,
  public.fahrtenbuch_monthly_odometer TO service_role;

CREATE INDEX fahrtenbuch_entries_vehicle_owner_idx
  ON public.fahrtenbuch_entries (vehicle_id, user_id);
CREATE INDEX fahrtenbuch_monthly_vehicle_owner_idx
  ON public.fahrtenbuch_monthly_odometer (vehicle_id, user_id);

COMMIT;
