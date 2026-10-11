-- Existing service_* columns remain the standard site. Additional sites share
-- the customer row's ownership/RLS and are saved atomically with that customer.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS additional_service_locations jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(additional_service_locations) = 'array');

COMMENT ON COLUMN public.customers.additional_service_locations IS
  'Additional work sites: [{id,address_line,postal_code,city,note}]. The standard site remains in service_*.';
