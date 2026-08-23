REVOKE EXECUTE ON FUNCTION public.subscriptions_block_employee_accounts() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "Angemeldete koennen Rollen lesen" ON public.user_roles;

CREATE POLICY "Eigene Rolle lesen"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));