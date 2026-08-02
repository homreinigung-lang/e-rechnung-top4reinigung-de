ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS website_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS facebook_url text NOT NULL DEFAULT '';

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS receipt_url text NOT NULL DEFAULT '';