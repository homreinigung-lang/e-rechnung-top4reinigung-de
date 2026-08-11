ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS decided_by uuid,
  ADD COLUMN IF NOT EXISTS decision_note text NOT NULL DEFAULT '';

DROP POLICY IF EXISTS "employee creates own time entries" ON public.time_entries;
DROP POLICY IF EXISTS "employee updates own unbilled time entries" ON public.time_entries;
DROP POLICY IF EXISTS "employee deletes own unbilled time entries" ON public.time_entries;

CREATE POLICY "employee requests own absences" ON public.time_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    employee_id = public.my_employee_id()
    AND user_id = public.my_employee_owner()
    AND billed = false
    AND entry_type = 'absence'
    AND approval_status = 'pending'
    AND hours = 0
  );

CREATE POLICY "employee withdraws own pending absences" ON public.time_entries
  FOR DELETE TO authenticated
  USING (
    employee_id = public.my_employee_id()
    AND billed = false
    AND entry_type = 'absence'
    AND approval_status = 'pending'
  );

CREATE TABLE IF NOT EXISTS public.time_account_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric NOT NULL DEFAULT 0,
  reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.time_account_adjustments TO authenticated;
GRANT ALL ON public.time_account_adjustments TO service_role;

ALTER TABLE public.time_account_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner manages time account adjustments" ON public.time_account_adjustments
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "employee reads own time account adjustments" ON public.time_account_adjustments
  FOR SELECT TO authenticated
  USING (employee_id = public.my_employee_id());

CREATE TRIGGER t_time_account_adjustments_updated
  BEFORE UPDATE ON public.time_account_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();