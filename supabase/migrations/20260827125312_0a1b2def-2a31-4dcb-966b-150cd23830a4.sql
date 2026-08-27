drop view if exists public.public_partners;

revoke select on public.subscriptions from anon;
grant select (id, company_name, city, sort_order, status, visible_on_landing)
  on public.subscriptions to anon;

create policy "Oeffentliche Partnerliste" on public.subscriptions
for select to anon
using (status = 'active' and visible_on_landing = true);