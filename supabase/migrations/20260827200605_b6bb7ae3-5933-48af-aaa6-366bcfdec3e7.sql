ALTER TABLE public.accountant_access
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

UPDATE public.accountant_access
  SET activated_at = last_used_at
  WHERE activated_at IS NULL AND last_used_at IS NOT NULL;