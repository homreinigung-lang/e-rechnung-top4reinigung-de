CREATE OR REPLACE FUNCTION public.is_employee_account(_auth_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.auth_user_id = _auth_user_id
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_employee_account(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_employee_account(uuid) TO authenticated, service_role;

DELETE FROM public.subscriptions s
WHERE public.is_employee_account(s.user_id);

CREATE OR REPLACE FUNCTION public.subscriptions_block_employee_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_employee_account(NEW.user_id) THEN
    RAISE EXCEPTION 'Mitarbeiter-Konten koennen kein eigenes Firmen-Abonnement haben';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS subscriptions_no_employee_accounts ON public.subscriptions;
CREATE TRIGGER subscriptions_no_employee_accounts
BEFORE INSERT OR UPDATE OF user_id ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.subscriptions_block_employee_accounts();