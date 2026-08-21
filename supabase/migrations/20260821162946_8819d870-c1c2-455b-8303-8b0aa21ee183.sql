ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS contract_start date,
  ADD COLUMN IF NOT EXISTS contract_end date,
  ADD COLUMN IF NOT EXISTS cleaning_frequency text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS agreement_terms text NOT NULL DEFAULT '';