REVOKE ALL ON FUNCTION public.owns_employee_auth_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owns_employee_auth_user(uuid) TO authenticated;