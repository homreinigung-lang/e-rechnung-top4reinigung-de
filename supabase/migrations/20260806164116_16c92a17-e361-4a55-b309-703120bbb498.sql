ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS phone text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "employee updates own record" ON public.employees;
CREATE POLICY "employee updates own record" ON public.employees
FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid())
WITH CHECK (auth_user_id = auth.uid());