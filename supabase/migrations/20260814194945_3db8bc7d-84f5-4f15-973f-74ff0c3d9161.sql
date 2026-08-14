CREATE TABLE public.account_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid NOT NULL UNIQUE,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  token text NOT NULL UNIQUE,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.account_approvals TO authenticated;
GRANT ALL ON public.account_approvals TO service_role;

ALTER TABLE public.account_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigenen Freigabestatus lesen"
ON public.account_approvals FOR SELECT TO authenticated
USING (auth.uid() = auth_user_id);

CREATE TRIGGER t_account_approvals_updated
BEFORE UPDATE ON public.account_approvals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();