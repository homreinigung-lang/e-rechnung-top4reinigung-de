CREATE TABLE public.accountant_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE,
  access_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '365 days'),
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.accountant_access TO authenticated;
GRANT ALL ON public.accountant_access TO service_role;

ALTER TABLE public.accountant_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own accountant access" ON public.accountant_access
FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_accountant_access_updated_at
BEFORE UPDATE ON public.accountant_access
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();