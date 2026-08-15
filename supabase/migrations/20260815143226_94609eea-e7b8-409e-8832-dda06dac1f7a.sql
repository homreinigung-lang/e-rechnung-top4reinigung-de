ALTER TABLE public.project_assignments
  ADD COLUMN IF NOT EXISTS day_hours jsonb NOT NULL DEFAULT '[0,0,0,0,0,0,0]'::jsonb;

DROP POLICY IF EXISTS "employee reads assigned projects" ON public.projects;
CREATE POLICY "employee reads assigned projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.project_assignments pa
    WHERE pa.project_id = projects.id
      AND pa.employee_id = public.my_employee_id()
  )
);