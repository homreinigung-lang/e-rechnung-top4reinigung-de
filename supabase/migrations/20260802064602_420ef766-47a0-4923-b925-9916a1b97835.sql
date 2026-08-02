ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS owner_name text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS logo_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_signature text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_host text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_port integer NOT NULL DEFAULT 587,
  ADD COLUMN IF NOT EXISTS smtp_user text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_from text NOT NULL DEFAULT '';

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS order_number text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tax_mode text NOT NULL DEFAULT 'eu_reverse_charge',
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_period text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS net_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS attachment_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS attachment_text text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.recurring_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  interval_months integer NOT NULL DEFAULT 1,
  next_run date NOT NULL DEFAULT CURRENT_DATE,
  active boolean NOT NULL DEFAULT true,
  template_document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recurring_invoices TO authenticated;
GRANT ALL ON public.recurring_invoices TO service_role;
ALTER TABLE public.recurring_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own recurring" ON public.recurring_invoices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_recurring_updated BEFORE UPDATE ON public.recurring_invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier text NOT NULL DEFAULT '',
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category text NOT NULL DEFAULT 'Sonstiges',
  document_number text NOT NULL DEFAULT '',
  net_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own expenses" ON public.expenses FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER t_expenses_updated BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DELETE FROM public.document_items WHERE document_id IN (SELECT id FROM public.documents WHERE number IN ('RE-2026-0001','RE-2026-0002'));
DELETE FROM public.documents WHERE number IN ('RE-2026-0001','RE-2026-0002');