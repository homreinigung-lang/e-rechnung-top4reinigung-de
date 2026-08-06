ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS employees_auth_user_id_key ON public.employees(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.my_employee_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.my_employee_owner()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.my_employee_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_employee_owner() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_employee_owner() TO authenticated;

-- Verknüpft das angemeldete Konto per E-Mail mit dem Mitarbeiterstammsatz
CREATE OR REPLACE FUNCTION public.link_employee_account()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
        mail text := lower(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', ''));
        eid uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
  SELECT id INTO eid FROM public.employees WHERE auth_user_id = uid LIMIT 1;
  IF eid IS NOT NULL THEN RETURN eid; END IF;
  IF mail = '' THEN RETURN NULL; END IF;
  UPDATE public.employees SET auth_user_id = uid
   WHERE lower(email) = mail AND auth_user_id IS NULL
   RETURNING id INTO eid;
  RETURN eid;
END; $$;

REVOKE ALL ON FUNCTION public.link_employee_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_employee_account() TO authenticated;

CREATE POLICY "employee reads own record" ON public.employees
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY "employee reads own time entries" ON public.time_entries
  FOR SELECT TO authenticated
  USING (employee_id = public.my_employee_id());

CREATE POLICY "employee creates own time entries" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.my_employee_id()
    AND user_id = public.my_employee_owner()
    AND billed = false
  );

CREATE POLICY "employee updates own unbilled time entries" ON public.time_entries
  FOR UPDATE TO authenticated
  USING (employee_id = public.my_employee_id() AND billed = false)
  WITH CHECK (employee_id = public.my_employee_id() AND billed = false);

CREATE POLICY "employee deletes own unbilled time entries" ON public.time_entries
  FOR DELETE TO authenticated
  USING (employee_id = public.my_employee_id() AND billed = false);