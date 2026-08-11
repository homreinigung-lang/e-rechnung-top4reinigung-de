ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS weekly_hours numeric NOT NULL DEFAULT 0;