-- Paid package orders must no longer be written directly from public/anon clients.
-- The application now creates them through an authenticated server function
-- using the service-role client after re-reading the selected plan and prices.

drop policy if exists "Anyone can submit an order" on public.plan_orders;

comment on table public.plan_orders is
  'Paid package orders. Inserts are created only by the authenticated application server; admins retain RLS-managed read/update/delete access.';
