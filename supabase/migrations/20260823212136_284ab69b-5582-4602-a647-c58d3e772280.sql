ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS small_business boolean NOT NULL DEFAULT false;