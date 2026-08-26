ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS address_line text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS postal_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS address_line text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS postal_code text NOT NULL DEFAULT '';

CREATE TABLE public.platform_invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  number text NOT NULL UNIQUE,
  issue_date date NOT NULL DEFAULT CURRENT_DATE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  customer_user_id uuid,
  customer_company text NOT NULL DEFAULT '',
  customer_address_line text NOT NULL DEFAULT '',
  customer_postal_code text NOT NULL DEFAULT '',
  customer_city text NOT NULL DEFAULT '',
  plan_code text NOT NULL DEFAULT '',
  plan_name text NOT NULL DEFAULT '',
  billing_interval text NOT NULL DEFAULT 'monthly',
  net_cents integer NOT NULL DEFAULT 0,
  vat_cents integer NOT NULL DEFAULT 0,
  gross_cents integer NOT NULL DEFAULT 0,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;

ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view platform invoices"
  ON public.platform_invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can create platform invoices"
  ON public.platform_invoices FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND created_by = auth.uid());

CREATE POLICY "Admins can update platform invoices"
  ON public.platform_invoices FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER t_platform_invoices_updated
  BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_platform_invoices_subscription ON public.platform_invoices(subscription_id);