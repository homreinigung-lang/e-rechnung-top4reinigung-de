ALTER TABLE public.calculations
  ADD COLUMN IF NOT EXISTS stair_visits_per_month numeric NOT NULL DEFAULT 0;