CREATE TABLE public.calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  cleaning_type text NOT NULL DEFAULT 'unterhalt',
  mode text NOT NULL DEFAULT 'area',
  area_sqm numeric NOT NULL DEFAULT 0,
  glass_sqm numeric NOT NULL DEFAULT 0,
  price_per_sqm numeric NOT NULL DEFAULT 0,
  hours numeric NOT NULL DEFAULT 0,
  hourly_rate numeric NOT NULL DEFAULT 0,
  frequency numeric NOT NULL DEFAULT 1,
  frequency_unit text NOT NULL DEFAULT 'month',
  travel numeric NOT NULL DEFAULT 0,
  extras text[] NOT NULL DEFAULT '{}',
  stairs boolean NOT NULL DEFAULT false,
  floors numeric NOT NULL DEFAULT 0,
  stair_rate numeric NOT NULL DEFAULT 0,
  has_lift boolean NOT NULL DEFAULT false,
  lift_rate numeric NOT NULL DEFAULT 0,
  discount_percent numeric NOT NULL DEFAULT 0,
  discount_amount numeric NOT NULL DEFAULT 0,
  discount_reason text NOT NULL DEFAULT '',
  tax_mode text NOT NULL DEFAULT 'domestic',
  note text NOT NULL DEFAULT '',
  proposal_title text NOT NULL DEFAULT '',
  proposal_text text NOT NULL DEFAULT '',
  net_total numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculations TO authenticated;
GRANT ALL ON public.calculations TO service_role;

ALTER TABLE public.calculations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Kalkulationen verwalten"
  ON public.calculations FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_calculations_updated
  BEFORE UPDATE ON public.calculations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_calculations_user ON public.calculations(user_id, updated_at DESC);

CREATE TABLE public.calculation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calculation_id uuid NOT NULL REFERENCES public.calculations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  position integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT '',
  unit_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.calculation_items TO authenticated;
GRANT ALL ON public.calculation_items TO service_role;

ALTER TABLE public.calculation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Kalkulationspositionen verwalten"
  ON public.calculation_items FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_calculation_items_updated
  BEFORE UPDATE ON public.calculation_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_calculation_items_calc ON public.calculation_items(calculation_id, position);