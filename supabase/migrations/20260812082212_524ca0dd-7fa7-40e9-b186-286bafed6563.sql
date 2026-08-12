CREATE OR REPLACE FUNCTION public.owns_employee_auth_user(_auth_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.auth_user_id = _auth_user_id AND e.user_id = auth.uid()
  );
$$;

CREATE POLICY "employer reads employee files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'firmen-dateien'
  AND public.owns_employee_auth_user(((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "employer deletes employee files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'firmen-dateien'
  AND public.owns_employee_auth_user(((storage.foldername(name))[1])::uuid)
);