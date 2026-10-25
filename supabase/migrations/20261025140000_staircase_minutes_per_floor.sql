ALTER TABLE public.performance_rates
ADD COLUMN IF NOT EXISTS minutes_per_floor numeric NULL;

ALTER TABLE public.performance_rates
ADD CONSTRAINT performance_rates_minutes_per_floor_positive
CHECK (minutes_per_floor IS NULL OR minutes_per_floor > 0);
