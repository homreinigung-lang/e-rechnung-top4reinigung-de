ALTER TABLE public.fahrtenbuch_entries
  ADD COLUMN IF NOT EXISTS trip_time time,
  ADD COLUMN IF NOT EXISTS trip_type text NOT NULL DEFAULT 'one_way';

ALTER TABLE public.fahrtenbuch_entries
  DROP CONSTRAINT IF EXISTS fahrtenbuch_entries_trip_type_check;

ALTER TABLE public.fahrtenbuch_entries
  ADD CONSTRAINT fahrtenbuch_entries_trip_type_check
  CHECK (trip_type IN ('one_way', 'round_trip'));
