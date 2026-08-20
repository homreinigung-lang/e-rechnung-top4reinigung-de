ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS service_address_line text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_postal_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS service_note text NOT NULL DEFAULT '';