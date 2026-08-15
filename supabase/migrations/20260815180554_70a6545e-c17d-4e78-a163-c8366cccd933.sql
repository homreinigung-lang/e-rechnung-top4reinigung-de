ALTER TABLE public.project_assignments
  ADD COLUMN IF NOT EXISTS day_times jsonb NOT NULL DEFAULT '[]'::jsonb;