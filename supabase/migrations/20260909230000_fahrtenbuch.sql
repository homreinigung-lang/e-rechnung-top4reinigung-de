CREATE TABLE public.fahrtenbuch_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trip_date date NOT NULL DEFAULT CURRENT_DATE,
  from_location text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  to_location text NOT NULL,
  start_km numeric(12,1) NOT NULL CHECK (start_km >= 0),
  end_km numeric(12,1) NOT NULL CHECK (end_km >= start_km),
  distance_km numeric(12,1) GENERATED ALWAYS AS (end_km - start_km) STORED,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fahrtenbuch_entries TO authenticated;
GRANT ALL ON public.fahrtenbuch_entries TO service_role;

ALTER TABLE public.fahrtenbuch_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages own Fahrtenbuch"
ON public.fahrtenbuch_entries
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX idx_fahrtenbuch_user_date
  ON public.fahrtenbuch_entries(user_id, trip_date DESC, created_at DESC);

CREATE INDEX idx_fahrtenbuch_customer
  ON public.fahrtenbuch_entries(customer_id);
