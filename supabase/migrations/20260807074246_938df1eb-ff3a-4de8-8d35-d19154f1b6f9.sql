ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS email_signature_html text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_signature_logo_url text NOT NULL DEFAULT '';