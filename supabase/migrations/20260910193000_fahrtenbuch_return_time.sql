ALTER TABLE public.fahrtenbuch_entries
  ADD COLUMN IF NOT EXISTS return_time time;
