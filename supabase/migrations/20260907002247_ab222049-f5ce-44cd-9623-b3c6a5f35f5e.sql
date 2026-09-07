CREATE TABLE public.time_entry_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_entry_id uuid NOT NULL REFERENCES public.time_entries(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (time_entry_id, employee_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_entry_employees TO authenticated;
GRANT ALL ON public.time_entry_employees TO service_role;

ALTER TABLE public.time_entry_employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages time entry employees"
ON public.time_entry_employees
FOR ALL
TO authenticated
USING (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND t.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.time_entries t WHERE t.id = time_entry_id AND t.user_id = auth.uid()));

CREATE POLICY "Employee reads own assignments"
ON public.time_entry_employees
FOR SELECT
TO authenticated
USING (employee_id = public.my_employee_id());

CREATE INDEX idx_time_entry_employees_entry ON public.time_entry_employees(time_entry_id);
CREATE INDEX idx_time_entry_employees_employee ON public.time_entry_employees(employee_id);

INSERT INTO public.time_entry_employees (time_entry_id, employee_id)
SELECT t.id, t.employee_id FROM public.time_entries t
WHERE t.employee_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS service_category text NOT NULL DEFAULT 'sonstiges';

ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_service_category_check
  CHECK (service_category IN ('unterhaltsreinigung','glasreinigung','bauendreinigung','sonstiges'));