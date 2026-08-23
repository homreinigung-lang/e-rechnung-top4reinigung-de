CREATE TABLE public.plan_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL DEFAULT ('BEST-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*100000))::int::text, 5, '0')),
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  plan_code text NOT NULL DEFAULT '',
  plan_name text NOT NULL DEFAULT '',
  billing_interval text NOT NULL DEFAULT 'monthly',
  company_name text NOT NULL DEFAULT '',
  contact_name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  address_line text NOT NULL DEFAULT '',
  postal_code text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT 'DE',
  vat_id text NOT NULL DEFAULT '',
  net_cents integer NOT NULL DEFAULT 0,
  vat_cents integer NOT NULL DEFAULT 0,
  gross_cents integer NOT NULL DEFAULT 0,
  reverse_charge boolean NOT NULL DEFAULT false,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.plan_orders TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.plan_orders TO authenticated;
GRANT ALL ON public.plan_orders TO service_role;

ALTER TABLE public.plan_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit an order"
  ON public.plan_orders FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can read orders"
  ON public.plan_orders FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update orders"
  ON public.plan_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete orders"
  ON public.plan_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER plan_orders_updated_at
  BEFORE UPDATE ON public.plan_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();