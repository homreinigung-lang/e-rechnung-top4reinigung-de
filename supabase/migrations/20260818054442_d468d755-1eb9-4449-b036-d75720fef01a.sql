CREATE TABLE public.performance_rates (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  usage_type text NOT NULL DEFAULT '',
  floor_covering text NOT NULL DEFAULT '',
  sqm_per_hour numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_rates TO authenticated;
GRANT ALL ON public.performance_rates TO service_role;

ALTER TABLE public.performance_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Eigene Leistungswerte verwalten" ON public.performance_rates
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER t_performance_rates_updated
  BEFORE UPDATE ON public.performance_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX performance_rates_user_idx ON public.performance_rates(user_id);