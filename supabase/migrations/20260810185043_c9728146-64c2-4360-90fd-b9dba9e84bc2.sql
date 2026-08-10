ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_project_id_idx ON public.time_entries(project_id);