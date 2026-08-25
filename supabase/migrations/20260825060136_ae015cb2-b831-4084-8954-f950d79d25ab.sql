CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS invite_code text NOT NULL DEFAULT public.gen_invite_code();

UPDATE public.company_settings SET invite_code = public.gen_invite_code()
 WHERE invite_code IS NULL OR invite_code = '';

CREATE UNIQUE INDEX IF NOT EXISTS company_settings_invite_code_key
  ON public.company_settings (invite_code);