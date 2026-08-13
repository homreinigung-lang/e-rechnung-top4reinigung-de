CREATE TABLE public.bank_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'gocardless',
  institution_id text NOT NULL DEFAULT '',
  institution_name text NOT NULL DEFAULT '',
  requisition_id text NOT NULL DEFAULT '',
  agreement_id text NOT NULL DEFAULT '',
  account_ids text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  last_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_connections TO authenticated;
GRANT ALL ON public.bank_connections TO service_role;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank connections" ON public.bank_connections
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES public.bank_connections(id) ON DELETE SET NULL,
  account_id text NOT NULL DEFAULT '',
  external_id text NOT NULL,
  booking_date date NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'EUR',
  counterparty_name text NOT NULL DEFAULT '',
  remittance_info text NOT NULL DEFAULT '',
  matched_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  matched_at timestamptz,
  match_score numeric NOT NULL DEFAULT 0,
  ignored boolean NOT NULL DEFAULT false,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, external_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bank_transactions TO authenticated;
GRANT ALL ON public.bank_transactions TO service_role;
ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank transactions" ON public.bank_transactions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX bank_transactions_user_date_idx ON public.bank_transactions (user_id, booking_date DESC);

CREATE TRIGGER update_bank_connections_updated_at BEFORE UPDATE ON public.bank_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bank_transactions_updated_at BEFORE UPDATE ON public.bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();