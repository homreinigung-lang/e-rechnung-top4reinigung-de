ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'work',
  ADD COLUMN IF NOT EXISTS absence_reason text NOT NULL DEFAULT '';

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_entry_type_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_entry_type_check CHECK (entry_type IN ('work','absence'));

ALTER TABLE public.time_entries
  DROP CONSTRAINT IF EXISTS time_entries_absence_reason_check;
ALTER TABLE public.time_entries
  ADD CONSTRAINT time_entries_absence_reason_check CHECK (absence_reason IN ('','vacation','sick','other'));