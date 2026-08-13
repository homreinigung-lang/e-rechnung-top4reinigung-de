ALTER TABLE public.project_rooms
  ADD COLUMN IF NOT EXISTS floor_covering text NOT NULL DEFAULT '';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS analysis_highlights text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS analysis_requirements text[] NOT NULL DEFAULT '{}'::text[];