-- 1) Prevent employees from self-modifying sensitive fields
CREATE OR REPLACE FUNCTION public.employees_self_update_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Owner (employer) may change anything
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  -- Employee self-service: only phone and name may change
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.hourly_rate IS DISTINCT FROM OLD.hourly_rate
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.personnel_number IS DISTINCT FROM OLD.personnel_number
     OR NEW.contract_type IS DISTINCT FROM OLD.contract_type
     OR NEW.contract_start IS DISTINCT FROM OLD.contract_start
     OR NEW.weekly_hours IS DISTINCT FROM OLD.weekly_hours
     OR NEW.work_location IS DISTINCT FROM OLD.work_location
  THEN
    RAISE EXCEPTION 'Mitarbeitende dürfen nur Name und Telefonnummer im eigenen Datensatz ändern.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_employees_self_update_guard ON public.employees;
CREATE TRIGGER t_employees_self_update_guard
BEFORE UPDATE ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.employees_self_update_guard();

-- 2) Employer storage management parity for employee files
DROP POLICY IF EXISTS "employer inserts employee files" ON storage.objects;
CREATE POLICY "employer inserts employee files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'firmen-dateien'
  AND public.owns_employee_auth_user(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "employer updates employee files" ON storage.objects;
CREATE POLICY "employer updates employee files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'firmen-dateien'
  AND public.owns_employee_auth_user(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'firmen-dateien'
  AND public.owns_employee_auth_user(((storage.foldername(name))[1])::uuid)
);

-- 3) Lock down SECURITY DEFINER function execution
REVOKE EXECUTE ON FUNCTION public.link_employee_account() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_employee_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_employee_owner() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_employee_auth_user(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_customer_number() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.next_document_number(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.create_storno(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finalize_document(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.employees_self_update_guard() FROM PUBLIC, anon, authenticated;
