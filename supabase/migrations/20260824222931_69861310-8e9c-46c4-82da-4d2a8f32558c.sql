ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS employee_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legal_form text NOT NULL DEFAULT '';

ALTER TABLE public.account_approvals
  ADD COLUMN IF NOT EXISTS company_name text NOT NULL DEFAULT '';