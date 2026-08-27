drop policy if exists "Oeffentliche Partnerliste" on public.subscriptions;

create or replace view public.public_partners
with (security_invoker = off) as
select id, company_name, city, sort_order
from public.subscriptions
where status = 'active' and visible_on_landing = true;

grant select on public.public_partners to anon, authenticated;